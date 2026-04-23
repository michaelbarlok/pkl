/**
 * Court-assignment engine for live tournament play.
 *
 * Drives two user-visible flows:
 *   - When organizers mark a division active, matches that have both
 *     teams free and all prior rounds in their pool complete become
 *     "eligible" (queue_entered_at set) and are handed to free
 *     courts in FIFO order across all active divisions.
 *   - When an organizer enters a score, the match's court frees;
 *     the engine promotes the next eligible match, filters out any
 *     candidates where either team is still on another court, and
 *     notifies the chosen teams to head there.
 *
 * See Phase 5 notes in the conversation that introduced this file.
 * For Phase 3 the entry points exist so the rest of the app can
 * depend on them; the full engine lands in Phase 5.
 */

import { createServiceClient } from "@/lib/supabase/server";

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
}

/**
 * Mark newly-eligible matches as queued by stamping
 * queue_entered_at (where null), then call assignFreeCourts to hand
 * as many queued matches as possible to open courts.
 *
 * Called after a division is activated or after a match is scored.
 */
export async function activateDivisionQueue(tournamentId: string): Promise<void> {
  const service = await createServiceClient();

  const { data: tournament } = await service
    .from("tournaments")
    .select("id, num_courts")
    .eq("id", tournamentId)
    .single();
  if (!tournament) return;

  const { data: activeDivs } = await service
    .from("tournament_active_divisions")
    .select("division")
    .eq("tournament_id", tournamentId);
  const activeSet = new Set((activeDivs ?? []).map((r: any) => r.division));
  if (activeSet.size === 0) return;

  const { data: matchesRaw } = await service
    .from("tournament_matches")
    .select(
      "id, tournament_id, division, round, match_number, bracket, player1_id, player2_id, status, court_number, queue_entered_at"
    )
    .eq("tournament_id", tournamentId);

  const matches = (matchesRaw ?? []) as TournamentMatch[];

  // Refresh queue_entered_at on newly-eligible matches. A match is
  // eligible when:
  //   - its division is active,
  //   - status = 'pending',
  //   - court_number IS NULL,
  //   - neither side is null (BYE rows skipped),
  //   - every prior-round match in its pool is completed.
  const nowIso = new Date().toISOString();
  const eligibleIds: string[] = [];
  for (const m of matches) {
    if (!m.division || !activeSet.has(m.division)) continue;
    if (m.status !== "pending") continue;
    if (m.court_number !== null) continue;
    if (!m.player1_id || !m.player2_id) continue;

    const priorSamePool = matches.filter(
      (o) =>
        o.division === m.division &&
        o.bracket === m.bracket &&
        o.round < m.round
    );
    const priorReady = priorSamePool.every(
      (o) => o.status === "completed" || o.status === "bye"
    );
    if (!priorReady) continue;

    if (!m.queue_entered_at) eligibleIds.push(m.id);
  }

  if (eligibleIds.length > 0) {
    await service
      .from("tournament_matches")
      .update({ queue_entered_at: nowIso })
      .in("id", eligibleIds);
  }

  // Phase 5 will implement court assignment (notifications + court_number
  // writes). For now, just ensure queue_entered_at is populated so the
  // player-facing "Next 3 matches" widget has something ordered to show.
}

/**
 * Called after an organizer records a match score. Frees the court
 * (court_number -> null implicitly when match flips to 'completed'
 * — handled by caller) and attempts to promote the next queued match.
 *
 * Phase 5 will wire full court handoff + notifications.
 */
export async function onMatchCompleted(tournamentId: string): Promise<void> {
  await activateDivisionQueue(tournamentId);
}
