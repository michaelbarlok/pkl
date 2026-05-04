/**
 * Court-assignment engine for live tournament play.
 *
 * Runs on two triggers:
 *   - Division activation (POST /api/tournaments/[id]/active-divisions).
 *   - Match completion (PUT /api/tournaments/[id]/bracket, after a
 *     score is recorded and the match flips to "completed").
 *
 * High-level loop (see runAssignmentPass below):
 *   1. Stamp queue_entered_at on newly-eligible matches (pending, no
 *      court, in an active division, non-BYE, all prior-round
 *      matches in their (division, bracket) completed).
 *   2. Figure out how many courts are free
 *      (num_courts - matches already on a court).
 *   3. Walk the queue (oldest queue_entered_at first, tie-break by
 *      round then match_number) and assign each free court to the
 *      first match where neither player is currently on another
 *      court. Mark both players "busy" within the pass so we don't
 *      double-assign across courts.
 *   4. Push "Head to Court N" to players of newly-assigned matches.
 *   5. Whatever match now sits at the top of the remaining queue
 *      gets a one-time "You're up next" push (tracked via
 *      up_next_notified_at so we don't spam on every pass).
 *
 * Write path uses the service client so RLS doesn't get in the way;
 * callers are already authorized via getTournamentManager().
 */

import { createServiceClient } from "@/lib/supabase/server";
import { notifyMany } from "@/lib/notify";
import { getDivisionLabel } from "@/lib/divisions";
import { resolveTournamentMatchFirstChoice } from "@/lib/tournament-first-choice";

interface TournamentMatch {
  id: string;
  tournament_id: string;
  division: string | null;
  round: number;
  match_number: number;
  bracket: string;
  player1_id: string | null;
  player2_id: string | null;
  status: string;
  court_number: number | null;
  queue_entered_at: string | null;
  up_next_notified_at: string | null;
  in_3rd_notified_at: string | null;
  /** Snapshot of allowed court numbers at the moment this match
   *  entered the queue. NULL = no snapshot (match pre-dates the
   *  column or hasn't been queued yet). Empty = no court eligible. */
  queued_court_set: number[] | null;
}

interface Tournament {
  id: string;
  title: string;
  num_courts: number | null;
  format: "round_robin" | "single_elimination" | "double_elimination";
}

/**
 * In doubles tournaments each `tournament_matches` row stores one
 * player per team — the registration's `player_id` (team anchor).
 * The second half of each team lives in `tournament_registrations.partner_id`.
 * Live-play notifications ("Head to Court N", "You're up next",
 * "Your division is live") need to reach BOTH halves of a team, so
 * we expand anchor IDs to full teams via this helper. Singles
 * tournaments have no partner rows, so the return value equals the
 * input. Returns a de-duplicated list.
 */
export async function expandTeamsForNotify(
  tournamentId: string,
  anchorPlayerIds: string[]
): Promise<string[]> {
  if (anchorPlayerIds.length === 0) return [];
  const service = await createServiceClient();
  const { data } = await service
    .from("tournament_registrations")
    .select("player_id, partner_id")
    .eq("tournament_id", tournamentId)
    .in("player_id", anchorPlayerIds)
    .neq("status", "withdrawn");
  const full = new Set<string>(anchorPlayerIds);
  for (const row of (data ?? []) as { player_id: string; partner_id: string | null }[]) {
    if (row.partner_id) full.add(row.partner_id);
  }
  return Array.from(full);
}

/**
 * Build a (anchor_id, division) → [anchor, partner?] resolver for one
 * tournament. Used by the assignment pass to detect double-booking
 * across divisions: a player who is the anchor in Div A and the
 * partner in Div B counts as "busy" in BOTH directions when one
 * of those matches takes a court. Without this, a partner who
 * isn't an anchor on a given match record is invisible to busy
 * detection and could be physically required on two courts at once.
 *
 * One DB read per pass. The map is keyed by `${player_id}::${division}`
 * because the same player can have a different partner in each
 * division they're entered in.
 */
async function buildTeamResolver(
  tournamentId: string
): Promise<(anchor: string | null, division: string | null) => string[]> {
  const service = await createServiceClient();
  const { data } = await service
    .from("tournament_registrations")
    .select("player_id, partner_id, division")
    .eq("tournament_id", tournamentId)
    .neq("status", "withdrawn");

  const partnerByKey = new Map<string, string | null>();
  for (const r of (data ?? []) as { player_id: string; partner_id: string | null; division: string }[]) {
    partnerByKey.set(`${r.player_id}::${r.division}`, r.partner_id ?? null);
  }

  return (anchor, division) => {
    if (!anchor) return [];
    if (!division) return [anchor];
    const partner = partnerByKey.get(`${anchor}::${division}`);
    return partner ? [anchor, partner] : [anchor];
  };
}

/**
 * Add every player on the match (anchor + partner of each team) to
 * the busy set. Wrapper so the queue-walk reads the same way the
 * eligibility check does.
 */
function teamPlayersForMatch(
  m: TournamentMatch,
  resolveTeam: (anchor: string | null, division: string | null) => string[]
): string[] {
  return [
    ...resolveTeam(m.player1_id, m.division),
    ...resolveTeam(m.player2_id, m.division),
  ];
}

/**
 * Interleave a queue of matches across divisions. Within each
 * division the pool-play order (round asc, match_number asc) is
 * preserved — this matters so BYEs rotate correctly — but when
 * several divisions are live at once we pluck one from each in
 * turn so the first batch of court assignments spreads across
 * divisions instead of piling onto whichever alphabetises first.
 *
 * Pass `rng` to shuffle the starting division order (used on
 * activation so different divisions get court #1 across runs).
 * Without `rng` the order is stable (Map insertion order after
 * timestamp/round/match sort), which is what we want for the
 * CourtTracker UI and the "next up" widget.
 */
export function interleaveQueueByDivision<
  T extends {
    division: string | null;
    round: number;
    match_number: number;
    queue_entered_at: string | null;
  }
>(matches: T[], rng?: () => number): T[] {
  const sorted = [...matches].sort((a, b) => {
    const ta = a.queue_entered_at ? new Date(a.queue_entered_at).getTime() : 0;
    const tb = b.queue_entered_at ? new Date(b.queue_entered_at).getTime() : 0;
    if (ta !== tb) return ta - tb;
    if (a.round !== b.round) return a.round - b.round;
    return a.match_number - b.match_number;
  });

  const byDivision = new Map<string, T[]>();
  for (const m of sorted) {
    const key = m.division ?? "__none__";
    if (!byDivision.has(key)) byDivision.set(key, []);
    byDivision.get(key)!.push(m);
  }

  const divisionKeys = Array.from(byDivision.keys());
  if (rng) {
    for (let i = divisionKeys.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [divisionKeys[i], divisionKeys[j]] = [divisionKeys[j], divisionKeys[i]];
    }
  }

  const result: T[] = [];
  for (let idx = 0; ; idx++) {
    let any = false;
    for (const key of divisionKeys) {
      const arr = byDivision.get(key)!;
      if (arr.length > idx) {
        result.push(arr[idx]);
        any = true;
      }
    }
    if (!any) break;
  }
  return result;
}

/**
 * Result of an assignment pass — the inputs the notification phase
 * needs. Returned from runAssignmentPass when caller wants to defer
 * notifications via waitUntil so the HTTP response can return as
 * soon as the DB writes (queue stamping + court assignment) commit.
 */
export interface AssignmentPassResult {
  tournament: Tournament;
  persisted: { match: TournamentMatch; court: number }[];
  stillQueued: TournamentMatch[];
}

/**
 * Called after an organizer records a match score (the caller has
 * already flipped the match to completed + cleared court_number).
 * Mirrors a division-activation pass — same queue logic applies.
 */
export async function onMatchCompleted(tournamentId: string): Promise<void> {
  await runAssignmentPass(tournamentId);
}

/**
 * Called when the organizer activates one or more divisions.
 *
 * Passes `reinterleave: true` so the entire pending queue (across
 * every currently-active division) is re-stamped via a fresh
 * cross-division interleave. Without this, staggered activations
 * — Div B activating two hours after Div A — would leave B's
 * matches stamped newer than A's entire remaining queue, so B
 * waits behind A instead of sharing courts 50/50. Matches already
 * on a court are left alone; this only touches waiting matches.
 */
export async function activateDivisionQueue(tournamentId: string): Promise<void> {
  await runAssignmentPass(tournamentId, { reinterleave: true });
}

/**
 * Deactivating a division pulls its queued (not-yet-on-a-court)
 * matches out of the FIFO line. Matches already on a court are left
 * alone — the current game finishes first, and when it's scored the
 * court will free up without being re-assigned (because the division
 * is no longer in the active set).
 */
export async function clearDivisionQueue(
  tournamentId: string,
  division: string
): Promise<void> {
  const service = await createServiceClient();
  await service
    .from("tournament_matches")
    .update({ queue_entered_at: null, queued_court_set: null })
    .eq("tournament_id", tournamentId)
    .eq("division", division)
    .is("court_number", null)
    .eq("status", "pending");
}

/**
 * Manual-promote: organizer explicitly sends a queued match onto a
 * specific court. Bypasses the automatic FIFO in runAssignmentPass
 * but keeps the same invariants (court must be free, match must be
 * eligible + queued + non-BYE, both teams must not be on another
 * court). Fires the usual "Head to Court N" notifications.
 *
 * Returns { ok: true } on success, { ok: false, error } otherwise —
 * API layer maps error codes to HTTP status.
 */
export async function promoteMatchToCourt(
  tournamentId: string,
  matchId: string,
  courtNumber: number
): Promise<{ ok: true } | { ok: false, error: string }> {
  const service = await createServiceClient();

  const { data: tournamentRaw } = await service
    .from("tournaments")
    .select("id, title, num_courts, format")
    .eq("id", tournamentId)
    .single();
  if (!tournamentRaw) return { ok: false, error: "Tournament not found" };
  const tournament = tournamentRaw as Tournament;
  const numCourts = tournament.num_courts ?? 0;
  if (courtNumber < 1 || courtNumber > numCourts) {
    return { ok: false, error: `Court ${courtNumber} is out of range` };
  }

  const { data: activeDivs } = await service
    .from("tournament_active_divisions")
    .select("division")
    .eq("tournament_id", tournamentId);
  const activeSet = new Set((activeDivs ?? []).map((r: any) => r.division));

  const { data: matchesRaw } = await service
    .from("tournament_matches")
    .select(
      "id, tournament_id, division, round, match_number, bracket, player1_id, player2_id, status, court_number, queue_entered_at, up_next_notified_at, in_3rd_notified_at, queued_court_set"
    )
    .eq("tournament_id", tournamentId);
  const matches = (matchesRaw ?? []) as TournamentMatch[];

  const match = matches.find((m) => m.id === matchId);
  if (!match) return { ok: false, error: "Match not found" };
  if (!isEligibleForQueue(match, matches, activeSet)) {
    return { ok: false, error: "Match isn't eligible to be scheduled yet" };
  }

  // Range gate — if the tournament has court ranges, a manual
  // "Send to Court N" still has to honor them. Prefer the snapshot
  // taken at enqueue time (queued_court_set) so a match queued
  // under a different range layout can't be shoved to a court that
  // wasn't eligible when it joined the queue.
  const courtRanges = await loadCourtRanges(tournamentId);
  const isCourtEligible = makeCourtEligibility(numCourts, courtRanges);
  const snap = (match as any).queued_court_set as number[] | null | undefined;
  const isAllowed =
    snap != null
      ? snap.includes(courtNumber)
      : isCourtEligible(match.division, courtNumber);
  if (!isAllowed) {
    return {
      ok: false,
      error: `Court ${courtNumber} isn't in this match's assigned range.`,
    };
  }

  // Court must be free — no other pending match holds it.
  const courtHolder = matches.find(
    (m) => m.court_number === courtNumber && m.status === "pending"
  );
  if (courtHolder && courtHolder.id !== matchId) {
    return { ok: false, error: `Court ${courtNumber} is in use` };
  }

  // Neither team — including doubles partners on either side — can be
  // on another court right now. Same partner-aware busy detection
  // runAssignmentPass uses, so a manual promote can't paint a player
  // onto two courts at once.
  const resolveTeam = await buildTeamResolver(tournamentId);
  const busyPlayers = new Set<string>();
  for (const m of matches) {
    if (m.status !== "pending" || m.court_number === null) continue;
    if (m.id === matchId) continue;
    for (const p of teamPlayersForMatch(m, resolveTeam)) busyPlayers.add(p);
  }
  const matchTeam = teamPlayersForMatch(match, resolveTeam);
  if (matchTeam.some((p) => busyPlayers.has(p))) {
    return { ok: false, error: "One of the teams is on another court already" };
  }

  // Partial unique index in migration 102 enforces "only one pending
  // match per (tournament, court)". A 23505 here means another writer
  // beat us to this court between our read above and our write — same
  // race the auto-pass handles, surfaced as a normal "court in use"
  // error to the organizer.
  const { error: promoteErr } = await service
    .from("tournament_matches")
    .update({ court_number: courtNumber })
    .eq("id", matchId);
  if (promoteErr) {
    const code = (promoteErr as { code?: string }).code;
    if (code === "23505") {
      return { ok: false, error: `Court ${courtNumber} is in use` };
    }
    return { ok: false, error: promoteErr.message };
  }

  await sendCourtReadyPushes(service, tournamentId, tournament, match, courtNumber);

  return { ok: true };
}

export async function runAssignmentPass(
  tournamentId: string,
  opts: { reinterleave?: boolean; skipNotifications?: boolean } = {}
): Promise<AssignmentPassResult | null> {
  const service = await createServiceClient();

  const { data: tournamentRaw } = await service
    .from("tournaments")
    .select("id, title, num_courts, format")
    .eq("id", tournamentId)
    .single();
  if (!tournamentRaw) return null;
  const tournament = tournamentRaw as Tournament;
  const numCourts = tournament.num_courts ?? 0;

  const { data: activeDivs } = await service
    .from("tournament_active_divisions")
    .select("division")
    .eq("tournament_id", tournamentId);
  const activeSet = new Set((activeDivs ?? []).map((r: any) => r.division));
  if (activeSet.size === 0) return null;

  // Court-range layout (may be empty → all-on-all default).
  const courtRanges = await loadCourtRanges(tournamentId);
  const isCourtEligible = makeCourtEligibility(numCourts, courtRanges);

  // When a new division activates we re-interleave the ENTIRE waiting
  // queue, not just freshly-eligible matches. Otherwise a late-
  // activating division would get matches stamped newer than the
  // already-queued division's remaining work and would be stuck
  // waiting behind it. Matches already on a court are untouched —
  // they're playing, not waiting. The subsequent fetch picks up the
  // nulled state and Step 1 re-stamps everything interleaved.
  if (opts.reinterleave) {
    await service
      .from("tournament_matches")
      .update({ queue_entered_at: null, queued_court_set: null })
      .eq("tournament_id", tournamentId)
      .eq("status", "pending")
      .is("court_number", null)
      .not("queue_entered_at", "is", null);
  }

  const { data: matchesRaw } = await service
    .from("tournament_matches")
    .select(
      "id, tournament_id, division, round, match_number, bracket, player1_id, player2_id, status, court_number, queue_entered_at, up_next_notified_at, in_3rd_notified_at, queued_court_set"
    )
    .eq("tournament_id", tournamentId);
  const matches = (matchesRaw ?? []) as TournamentMatch[];

  // ── Step 1: stamp queue_entered_at on newly-eligible matches.
  //
  // A queue is strict FIFO from this point on — the assignment loop
  // and the UI both read this column, sort ascending, and that's it.
  // To still give the first activation batch cross-division
  // fairness, we build an interleaved order here (A.1, B.1, C.1,
  // A.2, B.2, C.2, …) and stamp each match with a unique timestamp
  // 1ms apart, so they enter the queue in the interleaved order
  // *once* and then the queue never reshuffles.
  const newlyEligible: TournamentMatch[] = [];
  for (const m of matches) {
    if (!isEligibleForQueue(m, matches, activeSet)) continue;
    if (m.queue_entered_at) continue;
    newlyEligible.push(m);
  }
  if (newlyEligible.length > 0) {
    const orderedNewlyEligible = interleaveQueueByDivision(
      newlyEligible,
      Math.random
    );
    const nowMs = Date.now();
    for (let i = 0; i < orderedNewlyEligible.length; i++) {
      const ts = new Date(nowMs + i).toISOString();
      // Snapshot the courts this division is allowed to play on
      // RIGHT NOW, so a future edit to tournament_court_ranges
      // doesn't reroute this match. (Empty array when no court is
      // currently eligible — match still queues, just stays put.)
      const allowed = eligibleCourtsForDivision(
        numCourts,
        orderedNewlyEligible[i].division,
        isCourtEligible
      );
      await service
        .from("tournament_matches")
        .update({ queue_entered_at: ts, queued_court_set: allowed })
        .eq("id", orderedNewlyEligible[i].id);
      // Reflect the write in our local copy so the rest of this pass
      // treats the match as queued with the right ordering.
      const local = matches.find((m) => m.id === orderedNewlyEligible[i].id);
      if (local) {
        local.queue_entered_at = ts;
        local.queued_court_set = allowed;
      }
    }
  }

  // ── Step 2: available courts + busy players.
  //
  // A pending match holding a court_number occupies that court even
  // if its division was just deactivated — the players are still on
  // the court physically, the game is still being played. Filtering
  // by activeSet here would treat that court as free and the next
  // pass would assign another match to it, double-booking the court
  // physically.
  const onCourt = matches.filter(
    (m) => m.court_number !== null && m.status === "pending"
  );
  const usedCourtNumbers = new Set<number>(
    onCourt.map((m) => m.court_number!).filter((n): n is number => n !== null)
  );

  // Expand each on-court team to anchor + partner so a player who is
  // a partner in another division can't be double-booked. One DB read.
  const resolveTeam = await buildTeamResolver(tournamentId);
  const busyPlayers = new Set<string>();
  for (const m of onCourt) {
    for (const p of teamPlayersForMatch(m, resolveTeam)) busyPlayers.add(p);
  }

  // ── Step 3: walk the queue and assign. Pure FIFO by
  // queue_entered_at — the interleave already happened at enqueue
  // time (Step 1), so reading is strictly "whoever was in line
  // first goes first", skipping matches whose teams are currently
  // on another court.
  const queue = matches
    .filter(
      (m) =>
        m.status === "pending" &&
        m.court_number === null &&
        m.queue_entered_at !== null &&
        m.division &&
        activeSet.has(m.division) &&
        m.player1_id &&
        m.player2_id
    )
    .sort(
      (a, b) =>
        new Date(a.queue_entered_at!).getTime() -
        new Date(b.queue_entered_at!).getTime()
    );

  const freeCourts = Math.max(0, numCourts - onCourt.length);
  const assignments: { match: TournamentMatch; court: number }[] = [];

  for (const m of queue) {
    if (assignments.length >= freeCourts) break;
    if (!m.player1_id || !m.player2_id) continue;

    // Expand BOTH teams to their full doubles roster (anchor +
    // partner). Singles tournaments degrade to just the anchor.
    const matchTeam = teamPlayersForMatch(m, resolveTeam);
    if (matchTeam.some((p) => busyPlayers.has(p))) continue;

    // With ranges defined, a match might be locked to courts 1–10
    // even though courts 11–20 are free for other divisions. Skip
    // (don't break) so a later match in the queue whose range still
    // has openings can take the next free court. Prefer the snapshot
    // taken at enqueue time over re-reading the live ranges — that's
    // what keeps already-queued matches stable when an organizer
    // updates the layout after they're in line.
    let court: number | null;
    if (m.queued_court_set != null) {
      court = nextFreeFromSet(usedCourtNumbers, m.queued_court_set);
    } else {
      court = nextFreeCourtForDivision(
        numCourts,
        usedCourtNumbers,
        m.division,
        isCourtEligible
      );
    }
    if (court === null) continue;

    assignments.push({ match: m, court });
    for (const p of matchTeam) busyPlayers.add(p);
    usedCourtNumbers.add(court);
  }

  // Persist assignments. The partial unique index from migration 102
  // (tournament_matches_one_match_per_court_idx) guarantees only one
  // pending match per (tournament, court). Two parallel passes that
  // both decided the same court was free will see the loser hit a
  // 23505. We swallow that and skip — a subsequent pass picks the
  // bumped match back up. The local copy is only mutated when the
  // write actually persisted so downstream notification logic doesn't
  // claim a court that wasn't taken.
  const persisted: { match: TournamentMatch; court: number }[] = [];
  for (const { match, court } of assignments) {
    const { error } = await service
      .from("tournament_matches")
      .update({ court_number: court })
      .eq("id", match.id);
    if (error) {
      const code = (error as { code?: string }).code;
      if (code === "23505") {
        // Another pass beat us to this court. Leave the match in
        // the queue (court_number stays null) and move on.
        continue;
      }
      // Anything else: rethrow so the caller's catch logs it.
      throw error;
    }
    match.court_number = court;
    persisted.push({ match, court });
  }

  // Build the data the notification phase needs. `stillQueued` is
  // filtered AGAINST `persisted` so a match that lost a 23505 race
  // (didn't actually take its assigned court) is still in line for
  // position-push counting.
  const stillQueued = queue.filter(
    (m) => !persisted.some((a) => a.match.id === m.id)
  );
  const result: AssignmentPassResult = { tournament, persisted, stillQueued };

  // Notification phase. Heavy — push delivery can hang up to 10s on
  // stale subscriptions and Resend takes 1-3s per email. Gated by
  // opts.skipNotifications so the score-write hot path can run the
  // assignment in the request and defer this to waitUntil.
  if (!opts.skipNotifications) {
    await sendAssignmentPassNotifications(tournamentId, result);
  }

  return result;
}

/**
 * Steps 4 + 5 of the assignment pass — "Head to Court N" pushes for
 * freshly-assigned matches and queue-position pushes ("Up next",
 * "3rd in line") for the remaining queue. Extracted so a caller can
 * defer this work via waitUntil after a fast assignment phase.
 *
 * Idempotent on the position-push columns: each match has its own
 * `*_notified_at` column that's checked before sending and stamped
 * after, so a re-run of this function is a no-op for already-pushed
 * matches.
 */
export async function sendAssignmentPassNotifications(
  tournamentId: string,
  result: AssignmentPassResult,
): Promise<void> {
  const service = await createServiceClient();
  const { tournament, persisted, stillQueued } = result;

  // ── Step 4: "Head to Court N" pushes for freshly-assigned matches.
  for (const { match, court } of persisted) {
    await sendCourtReadyPushes(service, tournamentId, tournament, match, court);
  }

  // ── Step 5: queue-position pushes. Fires once per transition.
  const nowStampIso = new Date().toISOString();
  const positionTargets: Array<{
    match: TournamentMatch | undefined;
    column: "up_next_notified_at" | "in_3rd_notified_at";
    type: "tournament_up_next" | "tournament_in_3rd";
    title: string;
    body: (divLabel: string) => string;
  }> = [
    {
      match: stillQueued[0],
      column: "up_next_notified_at",
      type: "tournament_up_next",
      title: "You're up next",
      body: (divLabel) =>
        divLabel
          ? `${tournament.title} — ${divLabel}. Start warming up; a court will open soon.`
          : `${tournament.title}. Start warming up; a court will open soon.`,
    },
    {
      match: stillQueued[2],
      column: "in_3rd_notified_at",
      type: "tournament_in_3rd",
      title: "You're 3rd in the queue",
      body: (divLabel) =>
        divLabel
          ? `${tournament.title} — ${divLabel}. Two matches ahead of you; be nearby.`
          : `${tournament.title}. Two matches ahead of you; be nearby.`,
    },
  ];

  for (const t of positionTargets) {
    if (!t.match) continue;
    if (t.match[t.column]) continue;
    const anchorIds = [t.match.player1_id, t.match.player2_id].filter(
      (x): x is string => !!x
    );
    const playerIds = await expandTeamsForNotify(tournamentId, anchorIds);
    if (playerIds.length === 0) continue;
    const divLabel = t.match.division ? getDivisionLabel(t.match.division) : "";
    const bodyText = t.body(divLabel);
    await notifyMany(playerIds, {
      type: t.type,
      title: t.title,
      body: bodyText,
      link: `/tournaments/${tournamentId}/live`,
      emailTemplate: "TournamentAlert",
      emailData: {
        tournamentTitle: tournament.title,
        alertTitle: t.title,
        alertBody: bodyText,
        link: `/tournaments/${tournamentId}/live`,
      },
    });
    await service
      .from("tournament_matches")
      .update({ [t.column]: nowStampIso })
      .eq("id", t.match.id);
  }
}

function isEligibleForQueue(
  m: TournamentMatch,
  all: TournamentMatch[],
  activeSet: Set<string>
): boolean {
  if (!m.division || !activeSet.has(m.division)) return false;
  if (m.status !== "pending") return false;
  if (m.court_number !== null) return false;
  if (!m.player1_id || !m.player2_id) return false;

  const priorSamePool = all.filter(
    (o) =>
      o.division === m.division &&
      o.bracket === m.bracket &&
      o.round < m.round
  );
  return priorSamePool.every(
    (o) => o.status === "completed" || o.status === "bye"
  );
}

/**
 * One row from tournament_court_ranges, kept narrow to what the
 * assignment logic actually needs.
 */
interface CourtRange {
  court_start: number;
  court_end: number;
  divisions: string[];
}

/**
 * "Head to Court N" push fan-out, split per team so the body can name
 * which side has first choice. Pool play is balanced (resolves to one
 * team per match); playoffs go to the higher seed. Falls back to a
 * single combined push when first-choice can't be resolved (shouldn't
 * happen in practice but keeps the notification reliable).
 */
async function sendCourtReadyPushes(
  service: Awaited<ReturnType<typeof createServiceClient>>,
  tournamentId: string,
  tournament: Tournament,
  match: Pick<TournamentMatch, "id" | "bracket" | "division" | "round" | "match_number" | "player1_id" | "player2_id">,
  courtNumber: number,
): Promise<void> {
  const divLabel = match.division ? getDivisionLabel(match.division) : "";
  const courtTitle = `Head to Court ${courtNumber}`;
  const baseBody = divLabel
    ? `${tournament.title} — ${divLabel}. Your match is ready.`
    : `${tournament.title}. Your match is ready.`;

  const team1Anchor = match.player1_id;
  const team2Anchor = match.player2_id;

  const fcPick = await resolveTournamentMatchFirstChoice(
    service,
    tournamentId,
    {
      id: match.id,
      bracket: match.bracket,
      division: match.division ?? null,
      round: match.round,
      match_number: match.match_number,
      player1_id: match.player1_id,
      player2_id: match.player2_id,
    },
    tournament.format,
  );

  async function pushFor(
    anchorId: string | null,
    extra: string,
  ): Promise<void> {
    if (!anchorId) return;
    const recipients = await expandTeamsForNotify(tournamentId, [anchorId]);
    if (recipients.length === 0) return;
    const body = `${baseBody} ${extra}`.trim();
    await notifyMany(recipients, {
      type: "tournament_court_assigned",
      title: courtTitle,
      body,
      link: `/tournaments/${tournamentId}/live`,
      emailTemplate: "TournamentAlert",
      emailData: {
        tournamentTitle: tournament.title,
        alertTitle: courtTitle,
        alertBody: body,
        link: `/tournaments/${tournamentId}/live`,
      },
    });
  }

  if (fcPick === "team1") {
    await pushFor(team1Anchor, "You have first choice.");
    await pushFor(team2Anchor, "Opponents have first choice.");
  } else if (fcPick === "team2") {
    await pushFor(team1Anchor, "Opponents have first choice.");
    await pushFor(team2Anchor, "You have first choice.");
  } else {
    // Fallback: send the legacy combined push if we couldn't resolve
    // first-choice. Better to land the "your match is ready" alert
    // without the extra line than to drop it.
    const anchorIds = [team1Anchor, team2Anchor].filter(
      (x): x is string => !!x,
    );
    const recipients = await expandTeamsForNotify(tournamentId, anchorIds);
    if (recipients.length > 0) {
      await notifyMany(recipients, {
        type: "tournament_court_assigned",
        title: courtTitle,
        body: baseBody,
        link: `/tournaments/${tournamentId}/live`,
        emailTemplate: "TournamentAlert",
        emailData: {
          tournamentTitle: tournament.title,
          alertTitle: courtTitle,
          alertBody: baseBody,
          link: `/tournaments/${tournamentId}/live`,
        },
      });
    }
  }
}

/**
 * Pull the tournament's court ranges (if any) ordered by position.
 * Returned shape is intentionally minimal — assignment doesn't need
 * label or id, just the bounds and the division allowlist.
 */
async function loadCourtRanges(tournamentId: string): Promise<CourtRange[]> {
  const service = await createServiceClient();
  const { data } = await service
    .from("tournament_court_ranges")
    .select("court_start, court_end, divisions")
    .eq("tournament_id", tournamentId)
    .order("position", { ascending: true });
  return (data ?? []) as CourtRange[];
}

/**
 * Given the tournament's range layout, returns a predicate that
 * answers "can this match's division use court X?"
 *
 * Rules:
 *   * No ranges defined → any division on any court (legacy default).
 *   * Division IS in some range R → only courts within [R.start..R.end].
 *   * Division is NOT in any range, but ranges exist → only courts
 *     that aren't owned by any range. Lets organizers carve out a
 *     subset of divisions onto specific courts and leave the rest
 *     on whatever's free.
 */
function makeCourtEligibility(
  numCourts: number,
  ranges: CourtRange[]
): (division: string | null, court: number) => boolean {
  if (ranges.length === 0) {
    return () => true;
  }
  const divisionToRange = new Map<string, CourtRange>();
  const rangedCourts = new Set<number>();
  for (const r of ranges) {
    for (let c = r.court_start; c <= r.court_end; c++) rangedCourts.add(c);
    for (const d of r.divisions) divisionToRange.set(d, r);
  }
  return (division, court) => {
    if (court < 1 || court > numCourts) return false;
    if (!division) return !rangedCourts.has(court);
    const range = divisionToRange.get(division);
    if (range) {
      return court >= range.court_start && court <= range.court_end;
    }
    // Division has no range assignment — only free-form (unranged)
    // courts are eligible so it doesn't steal a slot reserved for a
    // ranged division.
    return !rangedCourts.has(court);
  };
}

/**
 * First free court that the given match's division is allowed to use.
 * Returns null if none — the match stays in queue this pass.
 */
function nextFreeCourtForDivision(
  numCourts: number,
  used: Set<number>,
  division: string | null,
  isCourtEligible: (division: string | null, court: number) => boolean
): number | null {
  for (let i = 1; i <= numCourts; i++) {
    if (used.has(i)) continue;
    if (!isCourtEligible(division, i)) continue;
    return i;
  }
  return null;
}

/**
 * Materialise the full list of court numbers a given division can
 * land on under the current range layout. Snapshotted onto each
 * match at enqueue time so subsequent edits to court ranges only
 * affect future matches — already-queued matches keep targeting
 * whatever courts they were eligible for at the moment they
 * entered the queue.
 */
function eligibleCourtsForDivision(
  numCourts: number,
  division: string | null,
  isCourtEligible: (division: string | null, court: number) => boolean
): number[] {
  const out: number[] = [];
  for (let i = 1; i <= numCourts; i++) {
    if (isCourtEligible(division, i)) out.push(i);
  }
  return out;
}

/** Picks a free court from a snapshot of allowed court numbers. */
function nextFreeFromSet(
  used: Set<number>,
  allowed: number[]
): number | null {
  for (const c of allowed) {
    if (!used.has(c)) return c;
  }
  return null;
}
