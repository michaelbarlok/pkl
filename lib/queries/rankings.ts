import { createClient } from "@/lib/supabase/server";

/**
 * Recalculate point percentage for a player in a group using the rolling window.
 * Point percentage = points scored / points possible across the last N sessions.
 * Points possible per game = the higher score (accounts for win-by-2).
 * Only counts the last N sessions per group_preferences.pct_window_sessions.
 */
export async function recalculateWinPct(
  groupId: string,
  playerId: string
): Promise<number> {
  const supabase = await createClient();

  // Get the window size
  const { data: prefs } = await supabase
    .from("group_preferences")
    .select("pct_window_sessions")
    .eq("group_id", groupId)
    .single();

  const windowSize = prefs?.pct_window_sessions ?? 6;

  // Get the last N completed sessions this player actually checked into
  const { data: recentParticipations } = await supabase
    .from("session_participants")
    .select("session_id, shootout_sessions!inner(group_id, status)")
    .eq("player_id", playerId)
    .eq("checked_in", true)
    .eq("shootout_sessions.group_id", groupId)
    .eq("shootout_sessions.status", "session_complete")
    .order("session_id", { ascending: false })
    .limit(windowSize);

  if (!recentParticipations || recentParticipations.length === 0) return 0;

  const sessionIds = recentParticipations.map((p) => p.session_id);

  // Get game results for this player in those sessions
  const { data: games } = await supabase
    .from("game_results")
    .select("*")
    .eq("group_id", groupId)
    .in("session_id", sessionIds)
    .or(
      `team_a_p1.eq.${playerId},team_a_p2.eq.${playerId},team_b_p1.eq.${playerId},team_b_p2.eq.${playerId}`
    );

  if (!games || games.length === 0) return 0;

  let pointsScored = 0;
  let pointsPossible = 0;

  for (const game of games) {
    const onTeamA =
      game.team_a_p1 === playerId || game.team_a_p2 === playerId;

    // Points possible per game = the higher score (accounts for win-by-2)
    const maxScore = Math.max(game.score_a, game.score_b);
    pointsPossible += maxScore;
    pointsScored += onTeamA ? game.score_a : game.score_b;
  }

  const pointPct =
    pointsPossible > 0
      ? Math.round((pointsScored / pointsPossible) * 10000) / 100
      : 0;

  // Update group_memberships
  await supabase
    .from("group_memberships")
    .update({ win_pct: pointPct })
    .eq("group_id", groupId)
    .eq("player_id", playerId);

  return pointPct;
}

/**
 * Recalculate point percentage for ALL players in a group.
 * Called after a session completes.
 */
export async function recalculateAllWinPcts(groupId: string): Promise<void> {
  const supabase = await createClient();

  const { data: members } = await supabase
    .from("group_memberships")
    .select("player_id")
    .eq("group_id", groupId);

  if (!members) return;

  await Promise.allSettled(
    members.map((m) => recalculateWinPct(groupId, m.player_id))
  );
}
