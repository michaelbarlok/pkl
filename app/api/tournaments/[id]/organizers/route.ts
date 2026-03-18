import { requireAuth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST: Add a co-organizer to a tournament.
 * DELETE: Remove a co-organizer from a tournament.
 *
 * Only the tournament creator or a global admin may manage co-organizers.
 */

async function authorize(tournamentId: string) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return null;

  const { data: tournament } = await auth.supabase
    .from("tournaments")
    .select("created_by")
    .eq("id", tournamentId)
    .single();
  if (!tournament) return null;

  // Only creator or global admin can manage co-organizers
  if (tournament.created_by !== auth.profile.id && auth.profile.role !== "admin") return null;

  return { profile: auth.profile, supabase: auth.supabase };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tournamentId } = await params;
  const auth = await authorize(tournamentId);
  if (!auth) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { profileId } = await request.json();
  if (!profileId) {
    return NextResponse.json({ error: "profileId required" }, { status: 400 });
  }

  const { supabase } = auth;

  // Don't add the creator as a co-organizer
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("created_by")
    .eq("id", tournamentId)
    .single();

  if (tournament && profileId === tournament.created_by) {
    return NextResponse.json({ error: "The creator is already the organizer" }, { status: 400 });
  }

  const { error } = await supabase
    .from("tournament_organizers")
    .upsert({ tournament_id: tournamentId, profile_id: profileId });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tournamentId } = await params;
  const auth = await authorize(tournamentId);
  if (!auth) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { profileId } = await request.json();
  if (!profileId) {
    return NextResponse.json({ error: "profileId required" }, { status: 400 });
  }

  const { error } = await auth.supabase
    .from("tournament_organizers")
    .delete()
    .eq("tournament_id", tournamentId)
    .eq("profile_id", profileId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
