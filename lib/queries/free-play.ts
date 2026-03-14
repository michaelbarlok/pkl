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
 * Fetch player stats (W-L-PtDiff) for a free play group.
 */
export async function getPlayerStats(
  groupId: string
): Promise<(FreePlayPlayerStats & { player: { id: string; display_name: string; avatar_url: string | null } })[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("free_play_player_stats")
    .select("*, player:profiles!free_play_player_stats_player_id_fkey(id, display_name, avatar_url)")
    .eq("group_id", groupId);

  if (error || !data) return [];

  // Sort by wins desc, then point diff desc
  return (data as any[]).sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    return b.total_point_diff - a.total_point_diff;
  });
}
