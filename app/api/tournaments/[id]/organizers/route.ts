import { requireAuth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST: Add a co-organizer to a tournament.
 * DELETE: Remove a co-organizer from a tournament.
 *
 * Auth model: creators, co-organizers, and global admins can manage
 * the list. Co-organizers can add help but cannot remove the creator
 * or other co-organizers — only creators / admins can evict. This
 * keeps the "one person holds the keys" bottleneck off the creator
 * while preventing co-organizers from kicking each other.
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

  const isCreator = tournament.created_by === auth.profile.id;
  const isAdmin = auth.profile.role === "admin";

  if (isCreator || isAdmin) {
    return { profile: auth.profile, supabase: auth.supabase, tournament, isCreator: true };
  }

  // Co-organizer check
  const { data: orgRow } = await auth.supabase
    .from("tournament_organizers")
    .select("profile_id")
    .eq("tournament_id", tournamentId)
    .eq("profile_id", auth.profile.id)
    .maybeSingle();
  if (!orgRow) return null;

  return { profile: auth.profile, supabase: auth.supabase, tournament, isCreator: false };
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

  const { supabase, tournament } = auth;

  // Don't add the creator as a co-organizer
  if (profileId === tournament.created_by) {
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

  // Co-organizers can remove themselves (step down) but not other
  // co-organizers — only creators / admins can evict.
  if (!auth.isCreator && profileId !== auth.profile.id) {
    return NextResponse.json(
      { error: "Only the tournament creator can remove other co-organizers" },
      { status: 403 }
    );
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
