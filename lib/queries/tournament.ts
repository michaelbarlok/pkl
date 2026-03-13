import { createClient } from "@/lib/supabase/server";
import type { Tournament, TournamentRegistration, TournamentMatch } from "@/types/database";

// ============================================================
// Types
// ============================================================

export interface TournamentWithCounts extends Tournament {
  creator: { id: string; display_name: string; avatar_url: string | null };
  registration_count: number;
}

// ============================================================
// Queries
// ============================================================

/**
 * List tournaments visible to the current user.
 * Includes registration count for display.
 */
export async function listTournaments(filters?: {
  status?: string;
  format?: string;
  skill_level?: string;
}): Promise<TournamentWithCounts[]> {
  const supabase = await createClient();

  let query = supabase
    .from("tournaments")
    .select("*, creator:profiles!created_by(id, display_name, avatar_url), registrations:tournament_registrations(count)")
    .order("start_date", { ascending: true });

  if (filters?.status) {
    query = query.eq("status", filters.status);
  }
  if (filters?.format) {
    query = query.eq("format", filters.format);
  }
  if (filters?.skill_level) {
    query = query.eq("skill_level", filters.skill_level);
  }

  const { data, error } = await query;
  if (error || !data) return [];

  return data.map((t: any) => ({
    ...t,
    registration_count: t.registrations?.[0]?.count ?? 0,
  }));
}

/**
 * Fetch a single tournament by ID with full details.
 */
export async function getTournament(id: string): Promise<(Tournament & {
  creator: { id: string; display_name: string; avatar_url: string | null };
}) | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tournaments")
    .select("*, creator:profiles!created_by(id, display_name, avatar_url)")
    .eq("id", id)
    .single();

  if (error || !data) return null;
  return data as any;
}

/**
 * Fetch registrations for a tournament.
 */
export async function getTournamentRegistrations(
  tournamentId: string
): Promise<TournamentRegistration[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tournament_registrations")
    .select("*, player:profiles!player_id(id, display_name, avatar_url), partner:profiles!partner_id(id, display_name, avatar_url)")
    .eq("tournament_id", tournamentId)
    .order("registered_at", { ascending: true });

  if (error || !data) return [];
  return data as any;
}

/**
 * Fetch matches for a tournament.
 */
export async function getTournamentMatches(
  tournamentId: string
): Promise<TournamentMatch[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tournament_matches")
    .select("*, player1:profiles!player1_id(id, display_name), player2:profiles!player2_id(id, display_name), winner:profiles!winner_id(id, display_name)")
    .eq("tournament_id", tournamentId)
    .order("round", { ascending: true })
    .order("match_number", { ascending: true });

  if (error || !data) return [];
  return data as any;
}

/**
 * Get the current user's registration for a tournament.
 */
export async function getMyRegistration(
  tournamentId: string
): Promise<TournamentRegistration | null> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!profile) return null;

  // Check as player or partner
  const { data } = await supabase
    .from("tournament_registrations")
    .select("*")
    .eq("tournament_id", tournamentId)
    .or(`player_id.eq.${profile.id},partner_id.eq.${profile.id}`)
    .neq("status", "withdrawn")
    .limit(1)
    .single();

  return data as TournamentRegistration | null;
}
