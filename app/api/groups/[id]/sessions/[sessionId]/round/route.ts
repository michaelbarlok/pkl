import { requireAuth, isGroupAdmin } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

/**
 * PATCH /api/groups/[id]/sessions/[sessionId]/round
 *
 * Admin-only: override the current round's team assignments and sit-out list
 * without advancing to the next round. Preserves round number and all history.
 *
 * Body: { matches: { teamA: [string, string]; teamB: [string, string] }[]; sitting: string[] }
 */
export async function PATCH(
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
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { matches, sitting } = body as {
    matches?: { teamA: [string, string]; teamB: [string, string] }[];
    sitting?: string[];
  };

  if (!Array.isArray(matches) || !Array.isArray(sitting)) {
    return NextResponse.json(
      { error: "matches and sitting are required" },
      { status: 400 }
    );
  }

  // Validate team sizes
  for (const m of matches) {
    if (m.teamA?.length !== 2 || m.teamB?.length !== 2) {
      return NextResponse.json(
        { error: "Each team must have exactly 2 players" },
        { status: 400 }
      );
    }
  }

  // Get active session
  const { data: session } = await auth.supabase
    .from("free_play_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("group_id", groupId)
    .eq("status", "active")
    .single();

  if (!session) {
    return NextResponse.json({ error: "Active session not found" }, { status: 404 });
  }

  // Get checked-in players
  const { data: sessionPlayers } = await auth.supabase
    .from("free_play_session_players")
    .select("player_id")
    .eq("session_id", sessionId);

  const checkedIn = new Set((sessionPlayers ?? []).map((sp) => sp.player_id as string));

  // Validate: all assigned players are in the session, no duplicates, full coverage
  const allAssigned = [
    ...matches.flatMap((m) => [...m.teamA, ...m.teamB]),
    ...sitting,
  ];

  const seen = new Set<string>();
  for (const id of allAssigned) {
    if (!checkedIn.has(id)) {
      return NextResponse.json(
        { error: "Player is not checked in to this session" },
        { status: 400 }
      );
    }
    if (seen.has(id)) {
      return NextResponse.json(
        { error: "Each player can only appear in one slot" },
        { status: 400 }
      );
    }
    seen.add(id);
  }

  if (seen.size !== checkedIn.size) {
    return NextResponse.json(
      { error: "All checked-in players must be assigned a slot" },
      { status: 400 }
    );
  }

  // Build updated round — preserve round number and all history, reset scores
  const round = session.current_round as any;
  const updatedRound = {
    ...round,
    matches: matches.map((m) => ({
      teamA: m.teamA,
      teamB: m.teamB,
      scoreA: null as number | null,
      scoreB: null as number | null,
    })),
    sitting,
  };

  const { data: updated, error: updateError } = await auth.supabase
    .from("free_play_sessions")
    .update({ current_round: updatedRound })
    .eq("id", sessionId)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json(updated);
}
