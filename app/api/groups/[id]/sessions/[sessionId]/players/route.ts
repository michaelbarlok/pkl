import { requireAuth, isGroupAdmin } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST   /api/groups/[id]/sessions/[sessionId]/players
 * DELETE /api/groups/[id]/sessions/[sessionId]/players?player_id=<uuid>
 *
 * Mid-session roster management. Admins add a late arriver or drop
 * someone who had to leave without having to end and restart the
 * session. Changes affect FUTURE rounds only — the current round's
 * assignments stay intact so in-flight matches aren't orphaned.
 *
 * POST body: { player_id: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> }
) {
  const { id: groupId, sessionId } = await params;
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const canManage = await isGroupAdmin(
    auth.supabase,
    auth.profile.id,
    groupId,
    auth.profile.role
  );
  if (!canManage) {
    return NextResponse.json({ error: "Only group admins can manage the session roster" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const playerId = typeof body.player_id === "string" ? body.player_id : "";
  if (!playerId) {
    return NextResponse.json({ error: "player_id required" }, { status: 400 });
  }

  // Confirm the session is still active on this group.
  const { data: session } = await auth.supabase
    .from("free_play_sessions")
    .select("id, status")
    .eq("id", sessionId)
    .eq("group_id", groupId)
    .eq("status", "active")
    .single();
  if (!session) {
    return NextResponse.json({ error: "Active session not found" }, { status: 404 });
  }

  // Confirm the target is a group member — avoids adding random
  // profiles to a session by id.
  const { data: membership } = await auth.supabase
    .from("group_memberships")
    .select("player_id")
    .eq("group_id", groupId)
    .eq("player_id", playerId)
    .maybeSingle();
  if (!membership) {
    return NextResponse.json({ error: "That player isn't a group member" }, { status: 400 });
  }

  // Idempotent: ignore if already in the roster.
  const { data: existing } = await auth.supabase
    .from("free_play_session_players")
    .select("session_id")
    .eq("session_id", sessionId)
    .eq("player_id", playerId)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  const { error } = await auth.supabase
    .from("free_play_session_players")
    .insert({ session_id: sessionId, player_id: playerId });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> }
) {
  const { id: groupId, sessionId } = await params;
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const canManage = await isGroupAdmin(
    auth.supabase,
    auth.profile.id,
    groupId,
    auth.profile.role
  );
  if (!canManage) {
    return NextResponse.json({ error: "Only group admins can manage the session roster" }, { status: 403 });
  }

  const playerId = request.nextUrl.searchParams.get("player_id");
  if (!playerId) {
    return NextResponse.json({ error: "player_id required" }, { status: 400 });
  }

  const { data: session } = await auth.supabase
    .from("free_play_sessions")
    .select("id, status")
    .eq("id", sessionId)
    .eq("group_id", groupId)
    .eq("status", "active")
    .single();
  if (!session) {
    return NextResponse.json({ error: "Active session not found" }, { status: 404 });
  }

  const { error } = await auth.supabase
    .from("free_play_session_players")
    .delete()
    .eq("session_id", sessionId)
    .eq("player_id", playerId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
