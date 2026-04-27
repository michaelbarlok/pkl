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
  type?: string;
  /** City / state substring. Case-insensitive ILIKE on tournaments.location. */
  location?: string;
  /** Gender prefix ("mens" | "womens" | "mixed"). Applied post-fetch
   *  because it matches against the divisions text[] column. */
  gender?: string;
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
  if (filters?.type && (filters.type === "singles" || filters.type === "doubles")) {
    query = query.eq("type", filters.type);
  }
  if (filters?.location && filters.location.trim() !== "") {
    // ILIKE substring so "Austin" finds "Austin, TX", "West Austin", etc.
    query = query.ilike("location", `%${filters.location.trim()}%`);
  }

  const { data, error } = await query;
  if (error || !data) return [];

  let rows = (data as unknown as (TournamentWithCounts & {
    registrations: { count: number }[];
  })[]).map((t) => ({
    ...t,
    registration_count: t.registrations?.[0]?.count ?? 0,
  }));

  // Gender filter — matches if ANY of the tournament's divisions
  // starts with "<gender>_". Done in JS because divisions is a
  // text[] column and a leading-prefix match against array elements
  // is clunky in PostgREST syntax.
  if (filters?.gender && ["mens", "womens", "mixed"].includes(filters.gender)) {
    const prefix = `${filters.gender}_`;
    rows = rows.filter((t) =>
      (t.divisions ?? []).some((d: string) => d.startsWith(prefix))
    );
  }

  return rows;
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
    .order("registered_at", { ascending: true })
    // Stable tiebreaker on id — without it, rows that share a
    // registered_at (e.g. teams inserted in the same transaction or
    // within the same nanosecond) come back in a non-deterministic
    // order, so a paid-toggle that triggers a refetch would silently
    // shuffle the rendered table.
    .order("id", { ascending: true });

  if (error || !data) return [];
  return data as unknown as TournamentRegistrationWithPlayers[];
}

/**
 * Fetch matches for a tournament.
 *
 * Explicit column list (instead of `*`) drops 7 internal columns
 * that no page-level consumer reads — `created_at`, `updated_at`,
 * `coin_flip_seed`, `up_next_notified_at`, `in_3rd_notified_at`,
 * `scheduled_time`, the legacy `court` text column, and
 * `queued_court_set` (used only by the queue assignment logic in
 * `lib/tournament-queue.ts`, which has its own SELECT). For a
 * tournament with 100+ matches that's ~30% fewer bytes off the
 * wire and per-render JSON parse on every realtime refresh.
 */
export async function getTournamentMatches(
  tournamentId: string
): Promise<TournamentMatchWithPlayers[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tournament_matches")
    .select(
      `id, tournament_id, round, match_number, bracket, division,
       player1_id, player2_id, winner_id, score1, score2, status,
       court_number, queue_entered_at, series_game,
       player1:profiles!player1_id(id, display_name),
       player2:profiles!player2_id(id, display_name),
       winner:profiles!winner_id(id, display_name)`
    )
    .eq("tournament_id", tournamentId)
    .order("round", { ascending: true })
    .order("match_number", { ascending: true });

  if (error || !data) return [];
  return data as unknown as TournamentMatchWithPlayers[];
}

/**
 * Get the current user's registration for a tournament. With
 * multi-division registration enabled, a player may have more
 * than one row (Men's + Mixed, Women's + Mixed). Returns the
 * "primary" — first by registered_at — for backward compatibility
 * with callers that only handle one. Use getMyRegistrations for
 * the full list.
 */
export async function getMyRegistration(
  tournamentId: string
): Promise<TournamentRegistration | null> {
  const all = await getMyRegistrations(tournamentId);
  return all[0] ?? null;
}

/**
 * All non-withdrawn registrations the current user has for this
 * tournament — could be 0, 1, or 2 (one gendered + one mixed).
 */
export async function getMyRegistrations(
  tournamentId: string
): Promise<TournamentRegistration[]> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!profile) return [];

  const { data } = await supabase
    .from("tournament_registrations")
    .select("*")
    .eq("tournament_id", tournamentId)
    .or(`player_id.eq.${profile.id},partner_id.eq.${profile.id}`)
    .neq("status", "withdrawn")
    .order("registered_at", { ascending: true });

  return (data ?? []) as unknown as TournamentRegistration[];
}
