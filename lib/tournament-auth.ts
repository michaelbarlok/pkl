import { getAuthUser } from "@/lib/auth";

/**
 * Check if the current user can manage a tournament.
 * Returns the profile and supabase client if authorized, null otherwise.
 *
 * A user can manage a tournament if they are:
 * - the tournament creator
 * - a co-organizer (in tournament_organizers)
 * - a global site admin
 */
export async function getTournamentManager(tournamentId: string) {
  const auth = await getAuthUser();
  if (!auth) return null;

  const { profile, supabase } = auth;

  // Global admin — always allowed
  if (profile.role === "admin") {
    return { profile, supabase };
  }

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("created_by")
    .eq("id", tournamentId)
    .single();
  if (!tournament) return null;

  // Creator
  if (tournament.created_by === profile.id) {
    return { profile, supabase };
  }

  // Co-organizer
  const { data: organizer } = await supabase
    .from("tournament_organizers")
    .select("profile_id")
    .eq("tournament_id", tournamentId)
    .eq("profile_id", profile.id)
    .single();

  if (organizer) {
    return { profile, supabase };
  }

  return null;
}
