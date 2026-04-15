import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getTournamentManager } from "@/lib/tournament-auth";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * PATCH: Toggle is_hidden on a tournament (global admin only).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tournamentId } = await params;

  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const body = await request.json().catch(() => ({}));
  const { is_hidden } = body as { is_hidden?: boolean };

  if (typeof is_hidden !== "boolean") {
    return NextResponse.json({ error: "is_hidden (boolean) is required" }, { status: 400 });
  }

  const serviceClient = await createServiceClient();
  const { error } = await serviceClient
    .from("tournaments")
    .update({ is_hidden })
    .eq("id", tournamentId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ id: tournamentId, is_hidden });
}

/**
 * DELETE: Delete a tournament (creator, co-organizer, or admin).
 * Cascades to tournament_registrations and tournament_matches via FK.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tournamentId } = await params;
  const auth = await getTournamentManager(tournamentId);
  if (!auth) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  // Delete tournament (cascades to registrations and matches)
  const { error } = await auth.supabase
    .from("tournaments")
    .delete()
    .eq("id", tournamentId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ status: "deleted" });
}
