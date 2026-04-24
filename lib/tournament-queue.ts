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
}

interface Tournament {
  id: string;
  title: string;
  num_courts: number | null;
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
 * Called after an organizer records a match score (the caller has
 * already flipped the match to completed + cleared court_number).
 * Mirrors a division-activation pass — same queue logic applies.
 */
export async function onMatchCompleted(tournamentId: string): Promise<void> {
  await runAssignmentPass(tournamentId);
}

/**
 * Called when the organizer activates one or more divisions.
 */
export async function activateDivisionQueue(tournamentId: string): Promise<void> {
  await runAssignmentPass(tournamentId);
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
    .update({ queue_entered_at: null })
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
    .select("id, title, num_courts")
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
      "id, tournament_id, division, round, match_number, bracket, player1_id, player2_id, status, court_number, queue_entered_at, up_next_notified_at, in_3rd_notified_at"
    )
    .eq("tournament_id", tournamentId);
  const matches = (matchesRaw ?? []) as TournamentMatch[];

  const match = matches.find((m) => m.id === matchId);
  if (!match) return { ok: false, error: "Match not found" };
  if (!isEligibleForQueue(match, matches, activeSet)) {
    return { ok: false, error: "Match isn't eligible to be scheduled yet" };
  }

  // Court must be free — no other pending match holds it.
  const courtHolder = matches.find(
    (m) => m.court_number === courtNumber && m.status === "pending"
  );
  if (courtHolder && courtHolder.id !== matchId) {
    return { ok: false, error: `Court ${courtNumber} is in use` };
  }

  // Neither team can be on another court right now.
  const busyPlayers = new Set<string>();
  for (const m of matches) {
    if (m.status !== "pending" || m.court_number === null) continue;
    if (m.id === matchId) continue;
    if (m.player1_id) busyPlayers.add(m.player1_id);
    if (m.player2_id) busyPlayers.add(m.player2_id);
  }
  if (
    (match.player1_id && busyPlayers.has(match.player1_id)) ||
    (match.player2_id && busyPlayers.has(match.player2_id))
  ) {
    return { ok: false, error: "One of the teams is on another court already" };
  }

  await service
    .from("tournament_matches")
    .update({ court_number: courtNumber })
    .eq("id", matchId);

  const anchorIds = [match.player1_id, match.player2_id].filter(
    (x): x is string => !!x
  );
  const playerIds = await expandTeamsForNotify(tournamentId, anchorIds);
  if (playerIds.length > 0) {
    const divLabel = match.division ? getDivisionLabel(match.division) : "";
    const courtTitle = `Head to Court ${courtNumber}`;
    const courtBody = divLabel
      ? `${tournament.title} — ${divLabel}. Your match is ready.`
      : `${tournament.title}. Your match is ready.`;
    await notifyMany(playerIds, {
      type: "tournament_court_assigned",
      title: courtTitle,
      body: courtBody,
      link: `/tournaments/${tournamentId}/live`,
      emailTemplate: "TournamentAlert",
      emailData: {
        tournamentTitle: tournament.title,
        alertTitle: courtTitle,
        alertBody: courtBody,
        link: `/tournaments/${tournamentId}/live`,
      },
    });
  }

  return { ok: true };
}

async function runAssignmentPass(tournamentId: string): Promise<void> {
  const service = await createServiceClient();

  const { data: tournamentRaw } = await service
    .from("tournaments")
    .select("id, title, num_courts")
    .eq("id", tournamentId)
    .single();
  if (!tournamentRaw) return;
  const tournament = tournamentRaw as Tournament;
  const numCourts = tournament.num_courts ?? 0;

  const { data: activeDivs } = await service
    .from("tournament_active_divisions")
    .select("division")
    .eq("tournament_id", tournamentId);
  const activeSet = new Set((activeDivs ?? []).map((r: any) => r.division));
  if (activeSet.size === 0) return;

  const { data: matchesRaw } = await service
    .from("tournament_matches")
    .select(
      "id, tournament_id, division, round, match_number, bracket, player1_id, player2_id, status, court_number, queue_entered_at, up_next_notified_at, in_3rd_notified_at"
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
      await service
        .from("tournament_matches")
        .update({ queue_entered_at: ts })
        .eq("id", orderedNewlyEligible[i].id);
      // Reflect the write in our local copy so the rest of this pass
      // treats the match as queued with the right ordering.
      const local = matches.find((m) => m.id === orderedNewlyEligible[i].id);
      if (local) local.queue_entered_at = ts;
    }
  }

  // ── Step 2: available courts + busy players.
  const onCourt = matches.filter(
    (m) =>
      m.court_number !== null &&
      m.status === "pending" &&
      m.division &&
      activeSet.has(m.division)
  );
  const usedCourtNumbers = new Set<number>(
    onCourt.map((m) => m.court_number!).filter((n): n is number => n !== null)
  );
  const busyPlayers = new Set<string>();
  for (const m of onCourt) {
    if (m.player1_id) busyPlayers.add(m.player1_id);
    if (m.player2_id) busyPlayers.add(m.player2_id);
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
    if (busyPlayers.has(m.player1_id) || busyPlayers.has(m.player2_id)) continue;

    const court = nextFreeCourt(numCourts, usedCourtNumbers);
    if (court === null) break;

    assignments.push({ match: m, court });
    busyPlayers.add(m.player1_id);
    busyPlayers.add(m.player2_id);
    usedCourtNumbers.add(court);
  }

  // Persist assignments.
  for (const { match, court } of assignments) {
    await service
      .from("tournament_matches")
      .update({ court_number: court })
      .eq("id", match.id);
    match.court_number = court;
  }

  // ── Step 4: "Head to Court N" pushes.
  for (const { match, court } of assignments) {
    const anchorIds = [match.player1_id, match.player2_id].filter(
      (x): x is string => !!x
    );
    const playerIds = await expandTeamsForNotify(tournamentId, anchorIds);
    if (playerIds.length === 0) continue;
    const divLabel = match.division ? getDivisionLabel(match.division) : "";
    const courtTitle = `Head to Court ${court}`;
    const courtBody = divLabel
      ? `${tournament.title} — ${divLabel}. Your match is ready.`
      : `${tournament.title}. Your match is ready.`;
    await notifyMany(playerIds, {
      type: "tournament_court_assigned",
      title: courtTitle,
      body: courtBody,
      link: `/tournaments/${tournamentId}/live`,
      emailTemplate: "TournamentAlert",
      emailData: {
        tournamentTitle: tournament.title,
        alertTitle: courtTitle,
        alertBody: courtBody,
        link: `/tournaments/${tournamentId}/live`,
      },
    });
  }

  // ── Step 5: queue-position pushes. Fires once per transition.
  // Position 1 ("Up next") and position 3 ("3rd in line") are the
  // two stops we notify at. Each uses its own _notified_at column
  // so a match only gets each ping a single time (a match can only
  // move forward in the line, so we never unset these).
  const stillQueued = queue.filter(
    (m) => !assignments.some((a) => a.match.id === m.id)
  );
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

function nextFreeCourt(
  numCourts: number,
  used: Set<number>
): number | null {
  for (let i = 1; i <= numCourts; i++) {
    if (!used.has(i)) return i;
  }
  return null;
}
