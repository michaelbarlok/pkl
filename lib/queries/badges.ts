import { createClient } from "@/lib/supabase/server";
import type { BadgeDefinition, PlayerBadge } from "@/types/database";

// ============================================================
// Types
// ============================================================

export interface PlayerBadgeWithDefinition extends PlayerBadge {
  badge: BadgeDefinition;
}

// ============================================================
// Queries
// ============================================================

/**
 * Fetch all badges earned by a player, with badge definitions joined.
 */
export async function getPlayerBadges(
  playerId: string
): Promise<PlayerBadgeWithDefinition[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("player_badges")
    .select("*, badge:badge_definitions(*)")
    .eq("player_id", playerId)
    .order("earned_at", { ascending: false });

  if (error || !data) return [];
  return data as PlayerBadgeWithDefinition[];
}

/**
 * Fetch all badge definitions, ordered by sort_order.
 */
export async function getAllBadgeDefinitions(): Promise<BadgeDefinition[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("badge_definitions")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error || !data) return [];
  return data as BadgeDefinition[];
}

/**
 * Get badge stats for a player (earned count vs total).
 */
export async function getBadgeStats(
  playerId: string
): Promise<{ earned: number; total: number }> {
  const supabase = await createClient();

  const [{ count: earned }, { count: total }] = await Promise.all([
    supabase
      .from("player_badges")
      .select("*", { count: "exact", head: true })
      .eq("player_id", playerId),
    supabase
      .from("badge_definitions")
      .select("*", { count: "exact", head: true }),
  ]);

  return { earned: earned ?? 0, total: total ?? 0 };
}

/**
 * Fetch the leaderboard of players with the most badges.
 */
export async function getBadgeLeaderboard(
  limit = 10
): Promise<{ player_id: string; badge_count: number; display_name: string; avatar_url: string | null }[]> {
  const supabase = await createClient();

  // Get badge counts grouped by player
  const { data: badgeCounts, error } = await supabase
    .from("player_badges")
    .select("player_id");

  if (error || !badgeCounts || badgeCounts.length === 0) return [];

  // Count badges per player
  const countMap = new Map<string, number>();
  for (const row of badgeCounts) {
    countMap.set(row.player_id, (countMap.get(row.player_id) ?? 0) + 1);
  }

  // Sort by count descending and take top N
  const sorted = [...countMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);

  if (sorted.length === 0) return [];

  // Fetch profiles for these players
  const playerIds = sorted.map(([id]) => id);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url")
    .in("id", playerIds);

  const profileMap = new Map(
    (profiles ?? []).map((p) => [p.id, p])
  );

  return sorted.map(([id, count]) => ({
    player_id: id,
    badge_count: count,
    display_name: profileMap.get(id)?.display_name ?? "Unknown",
    avatar_url: profileMap.get(id)?.avatar_url ?? null,
  }));
}
