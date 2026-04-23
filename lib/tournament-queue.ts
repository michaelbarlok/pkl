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
}

interface Tournament {
  id: string;
  title: string;
  num_courts: number | null;
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
      "id, tournament_id, division, round, match_number, bracket, player1_id, player2_id, status, court_number, queue_entered_at, up_next_notified_at"
    )
    .eq("tournament_id", tournamentId);
  const matches = (matchesRaw ?? []) as TournamentMatch[];

  // ── Step 1: stamp queue_entered_at on newly-eligible matches.
  const nowIso = new Date().toISOString();
  const newlyEligibleIds: string[] = [];
  for (const m of matches) {
    if (!isEligibleForQueue(m, matches, activeSet)) continue;
    if (m.queue_entered_at) continue;
    newlyEligibleIds.push(m.id);
  }
  if (newlyEligibleIds.length > 0) {
    await service
      .from("tournament_matches")
      .update({ queue_entered_at: nowIso })
      .in("id", newlyEligibleIds);
    // Reflect the write in our local copy so the rest of this pass
    // treats them as queued.
    for (const m of matches) {
      if (newlyEligibleIds.includes(m.id)) m.queue_entered_at = nowIso;
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

  // ── Step 3: walk the queue and assign.
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
    .sort((a, b) => {
      // queue_entered_at cannot be null here (filter above).
      const ta = new Date(a.queue_entered_at!).getTime();
      const tb = new Date(b.queue_entered_at!).getTime();
      if (ta !== tb) return ta - tb;
      if (a.round !== b.round) return a.round - b.round;
      return a.match_number - b.match_number;
    });

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
    const playerIds = [match.player1_id, match.player2_id].filter(
      (x): x is string => !!x
    );
    if (playerIds.length === 0) continue;
    const divLabel = match.division ? getDivisionLabel(match.division) : "";
    await notifyMany(playerIds, {
      type: "tournament_court_assigned",
      title: `Head to Court ${court}`,
      body: divLabel
        ? `${tournament.title} — ${divLabel}. Your match is ready.`
        : `${tournament.title}. Your match is ready.`,
      link: `/tournaments/${tournamentId}/live`,
    });
  }

  // ── Step 5: "You're up next" for the new top of queue.
  const stillQueued = queue.filter(
    (m) => !assignments.some((a) => a.match.id === m.id)
  );
  const topOfQueue = stillQueued[0];
  if (topOfQueue && !topOfQueue.up_next_notified_at) {
    const playerIds = [topOfQueue.player1_id, topOfQueue.player2_id].filter(
      (x): x is string => !!x
    );
    if (playerIds.length > 0) {
      const divLabel = topOfQueue.division
        ? getDivisionLabel(topOfQueue.division)
        : "";
      await notifyMany(playerIds, {
        type: "tournament_up_next",
        title: "You're up next",
        body: divLabel
          ? `${tournament.title} — ${divLabel}. Start warming up; a court will open soon.`
          : `${tournament.title}. Start warming up; a court will open soon.`,
        link: `/tournaments/${tournamentId}/live`,
      });
      await service
        .from("tournament_matches")
        .update({ up_next_notified_at: nowIso })
        .eq("id", topOfQueue.id);
    }
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
