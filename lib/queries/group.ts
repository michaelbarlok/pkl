import { createClient } from "@/lib/supabase/server";
import { rankingSheetSort, type RankedPlayer } from "@/lib/shootout-engine";
import type {
  ShootoutGroup,
  GroupPreferences,
  GroupMembership,
  SignupSheet,
} from "@/types/database";

// ============================================================
// Types
// ============================================================

export interface GroupWithPreferences extends ShootoutGroup {
  group_preferences: GroupPreferences | null;
}

export interface MemberWithProfile extends Omit<GroupMembership, "player"> {
  player: {
    id: string;
    full_name: string;
    display_name: string;
    avatar_url: string | null;
    email: string;
  };
}

// ============================================================
// Queries
// ============================================================

/**
 * Fetch a group by its slug, including its preferences.
 */
export async function getGroupBySlug(
  slug: string
): Promise<GroupWithPreferences | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("shootout_groups")
    .select("*, group_preferences(*)")
    .eq("slug", slug)
    .single();

  if (error || !data) return null;

  return data as GroupWithPreferences;
}

/**
 * Fetch all members of a group with their profiles,
 * sorted by ranking sheet order (Step ASC -> Pt% DESC -> Last Played DESC -> Sessions DESC).
 */
export async function getGroupMembers(
  groupId: string
): Promise<MemberWithProfile[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("group_memberships")
    .select(
      "*, player:profiles!group_memberships_player_id_fkey(id, full_name, display_name, avatar_url, email)"
    )
    .eq("group_id", groupId);

  if (error || !data) return [];

  const members = data as MemberWithProfile[];

  // Sort using the engine's ranking sheet sort
  const rankedPlayers: (RankedPlayer & { _index: number })[] = members.map(
    (m, i) => ({
      id: m.player_id,
      currentStep: m.current_step,
      winPct: m.win_pct,
      lastPlayedAt: m.last_played_at ?? null,
      totalSessions: m.total_sessions,
      _index: i,
    })
  );

  const sorted = rankingSheetSort(rankedPlayers) as (RankedPlayer & {
    _index: number;
  })[];

  return sorted.map((rp) => members[rp._index]);
}

/**
 * Fetch upcoming signup sheets for a group (open status, future dates).
 * Applies the 12-hour post-event expiry so a morning event stops showing
 * up later the same day.
 */
export async function getGroupSheets(
  groupId: string
): Promise<SignupSheet[]> {
  const supabase = await createClient();
  const { sheetIsExpired } = await import("@/lib/sheet-lifecycle");

  const { data, error } = await supabase
    .from("signup_sheets")
    .select("*")
    .eq("group_id", groupId)
    .eq("status", "open")
    .gte("event_date", new Date().toISOString().split("T")[0])
    .order("event_date", { ascending: true });

  if (error || !data) return [];

  return (data as SignupSheet[]).filter((s) => !sheetIsExpired(s));
}

/**
 * Check whether a player is a member of a group.
 */
export async function isGroupMember(
  groupId: string,
  playerId: string
): Promise<boolean> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("group_memberships")
    .select("player_id")
    .eq("group_id", groupId)
    .eq("player_id", playerId)
    .maybeSingle();

  if (error) return false;

  return data !== null;
}
