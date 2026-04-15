import { createClient } from "@/lib/supabase/server";
import type { Tournament, TournamentRegistration, TournamentMatch } from "@/types/database";

// ============================================================
// Types
// ============================================================

/** Compact profile shape returned by joined queries. */
interface ProfileRef {
  id: string;
  display_name: string;
  avatar_url?: string | null;
}

export interface TournamentWithCounts extends Omit<Tournament, 'creator'> {
  creator: ProfileRef;
  registration_count: number;
}

/** Registration row with player/partner joins populated. */
export type TournamentRegistrationWithPlayers = TournamentRegistration & {
  player: ProfileRef;
  partner: ProfileRef | null;
};

/** Match row with player joins populated. */
export type TournamentMatchWithPlayers = TournamentMatch & {
  player1: Pick<ProfileRef, "id" | "display_name"> | null;
  player2: Pick<ProfileRef, "id" | "display_name"> | null;
  winner: Pick<ProfileRef, "id" | "display_name"> | null;
};

// ============================================================
// Queries
// ============================================================

/**
 * List tournaments visible to the current user.
 * Includes registration count for display.
 * Hidden tournaments are excluded unless the caller is a global admin.
 */
export async function listTournaments(filters?: {
  status?: string;
  format?: string;
}): Promise<TournamentWithCounts[]> {
  const supabase = await createClient();

  // Determine if the current user is a global admin
  const { data: { user } } = await supabase.auth.getUser();
  let isAdmin = false;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("user_id", user.id)
      .single();
    isAdmin = profile?.role === "admin";
  }

  let query = supabase
    .from("tournaments")
    .select("*, creator:profiles!created_by(id, display_name, avatar_url), registrations:tournament_registrations(count)")
    .order("start_date", { ascending: true });

  // Non-admins only see visible tournaments
  if (!isAdmin) {
    query = query.eq("is_hidden", false);
  }

  if (filters?.status) {
    query = query.eq("status", filters.status);
  }
  if (filters?.format) {
    query = query.eq("format", filters.format);
  }

  const { data, error } = await query;
  if (error || !data) return [];

  return (data as unknown as (TournamentWithCounts & { registrations: { count: number }[] })[]).map((t) => ({
    ...t,
    registration_count: t.registrations?.[0]?.count ?? 0,
  }));
}

/**
 * Fetch a single tournament by ID with full details.
 */
export async function getTournament(id: string): Promise<(Tournament & {
  creator: ProfileRef;
}) | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tournaments")
    .select("*, creator:profiles!created_by(id, display_name, avatar_url)")
    .eq("id", id)
    .single();

  if (error || !data) return null;
  return data as unknown as Tournament & { creator: ProfileRef };
}

/**
 * Fetch registrations for a tournament.
 */
export async function getTournamentRegistrations(
  tournamentId: string
): Promise<TournamentRegistrationWithPlayers[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tournament_registrations")
    .select("*, division, player:profiles!player_id(id, display_name, avatar_url), partner:profiles!partner_id(id, display_name, avatar_url)")
    .eq("tournament_id", tournamentId)
    .order("registered_at", { ascending: true });

  if (error || !data) return [];
  return data as unknown as TournamentRegistrationWithPlayers[];
}

/**
 * Fetch matches for a tournament.
 */
export async function getTournamentMatches(
  tournamentId: string
): Promise<TournamentMatchWithPlayers[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tournament_matches")
    .select("*, player1:profiles!player1_id(id, display_name), player2:profiles!player2_id(id, display_name), winner:profiles!winner_id(id, display_name)")
    .eq("tournament_id", tournamentId)
    .order("round", { ascending: true })
    .order("match_number", { ascending: true });

  if (error || !data) return [];
  return data as unknown as TournamentMatchWithPlayers[];
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

  // Check as player or partner — maybeSingle() treats zero rows as null (not an error)
  const { data } = await supabase
    .from("tournament_registrations")
    .select("*")
    .eq("tournament_id", tournamentId)
    .or(`player_id.eq.${profile.id},partner_id.eq.${profile.id}`)
    .neq("status", "withdrawn")
    .limit(1)
    .maybeSingle();

  return data as unknown as TournamentRegistration | null;
}
