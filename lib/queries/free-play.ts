import { createClient } from "@/lib/supabase/server";
import type { FreePlayMatch, FreePlayPlayerStats } from "@/types/database";

// ============================================================
// Types
// ============================================================

export interface FreePlayMatchWithPlayers extends Omit<FreePlayMatch, 'team_a_p1_profile' | 'team_a_p2_profile' | 'team_b_p1_profile' | 'team_b_p2_profile'> {
  team_a_p1_profile: { id: string; display_name: string; avatar_url: string | null };
  team_a_p2_profile: { id: string; display_name: string; avatar_url: string | null } | null;
  team_b_p1_profile: { id: string; display_name: string; avatar_url: string | null };
  team_b_p2_profile: { id: string; display_name: string; avatar_url: string | null } | null;
}

// ============================================================
// Queries
// ============================================================

/**
 * Fetch recent free play matches for a group with player profiles.
 */
export async function getRecentMatches(
  groupId: string,
  limit = 20
): Promise<FreePlayMatchWithPlayers[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("free_play_matches")
    .select(
      `*,
       team_a_p1_profile:profiles!free_play_matches_team_a_p1_fkey(id, display_name, avatar_url),
       team_a_p2_profile:profiles!free_play_matches_team_a_p2_fkey(id, display_name, avatar_url),
       team_b_p1_profile:profiles!free_play_matches_team_b_p1_fkey(id, display_name, avatar_url),
       team_b_p2_profile:profiles!free_play_matches_team_b_p2_fkey(id, display_name, avatar_url)`
    )
    .eq("group_id", groupId)
    .order("played_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data as FreePlayMatchWithPlayers[];
}

/**
 * Fetch player stats (percent of points won) for a free play group.
 * Rolling window = last N completed sessions (configurable per group, default 14).
 */
export async function getPlayerStats(
  groupId: string
): Promise<(FreePlayPlayerStats & { player: { id: string; display_name: string; avatar_url: string | null } })[]> {
  const supabase = await createClient();

  // 1. Get group settings and sessions in parallel
  const [{ data: group }, { data: allSessions }] = await Promise.all([
    supabase
      .from("shootout_groups")
      .select("rolling_sessions_count, stats_reset_at")
      .eq("id", groupId)
      .single(),
    supabase
      .from("free_play_sessions")
      .select("id")
      .eq("group_id", groupId)
      .in("status", ["completed", "active"])
      .order("created_at", { ascending: false })
      .limit(50), // fetch enough, trim after settings loaded
  ]);

  const rollingCount = group?.rolling_sessions_count ?? 14;
  const sessions = (allSessions ?? []).slice(0, rollingCount);

  if (!sessions?.length) return [];

  const sessionIds = sessions.map((s) => s.id);

  // 3. Get all matches from those sessions
  let query = supabase
    .from("free_play_matches")
    .select("team_a_p1, team_a_p2, team_b_p1, team_b_p2, score_a, score_b, played_at")
    .eq("group_id", groupId)
    .in("session_id", sessionIds);

  if (group?.stats_reset_at) {
    query = query.gte("played_at", group.stats_reset_at);
  }

  const { data: matches } = await query;
  if (!matches?.length) return [];

  // 4. Calculate per-player: points won, points possible, games played, W/L, point diff
  const playerMap: Record<string, { points_won: number; points_possible: number; games_played: number; wins: number; losses: number; point_diff: number }> = {};

  for (const match of matches) {
    const pointsPossible = Math.max(match.score_a, match.score_b);
    const teamAWon = match.score_a > match.score_b;
    const tie = match.score_a === match.score_b;

    // Team A players
    for (const playerId of [match.team_a_p1, match.team_a_p2]) {
      if (!playerId) continue;
      if (!playerMap[playerId]) playerMap[playerId] = { points_won: 0, points_possible: 0, games_played: 0, wins: 0, losses: 0, point_diff: 0 };
      playerMap[playerId].points_won += match.score_a;
      playerMap[playerId].points_possible += pointsPossible;
      playerMap[playerId].games_played += 1;
      playerMap[playerId].point_diff += match.score_a - match.score_b;
      if (!tie) { teamAWon ? playerMap[playerId].wins++ : playerMap[playerId].losses++; }
    }

    // Team B players
    for (const playerId of [match.team_b_p1, match.team_b_p2]) {
      if (!playerId) continue;
      if (!playerMap[playerId]) playerMap[playerId] = { points_won: 0, points_possible: 0, games_played: 0, wins: 0, losses: 0, point_diff: 0 };
      playerMap[playerId].points_won += match.score_b;
      playerMap[playerId].points_possible += pointsPossible;
      playerMap[playerId].games_played += 1;
      playerMap[playerId].point_diff += match.score_b - match.score_a;
      if (!tie) { !teamAWon ? playerMap[playerId].wins++ : playerMap[playerId].losses++; }
    }
  }

  // 5. Get player profiles
  const playerIds = Object.keys(playerMap);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url")
    .in("id", playerIds);

  const profileMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]));

  // 6. Build result, sort by pct desc then games played desc
  return playerIds
    .map((id) => {
      const s = playerMap[id];
      return {
        player_id: id,
        group_id: groupId,
        points_won: s.points_won,
        points_possible: s.points_possible,
        games_played: s.games_played,
        wins: s.wins,
        losses: s.losses,
        point_diff: s.point_diff,
        pct: s.points_possible > 0 ? (s.points_won / s.points_possible) * 100 : 0,
        player: profileMap[id] ?? { id, display_name: "Unknown", avatar_url: null },
      };
    })
    .sort((a, b) => b.wins - a.wins || b.point_diff - a.point_diff || b.pct - a.pct);
}
