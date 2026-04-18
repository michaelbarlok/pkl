import { requireAuth, isGroupAdmin } from "@/lib/auth";
import { pairKey } from "@/lib/free-play-engine";
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

  const round = session.current_round as any;

  // Update partnerHistory and opponentHistory to reflect the edited assignments.
  // Strategy: decrement the original round's contributions, then add the new ones.
  // byeHistory is left alone — next-round will add this round's sitters when advancing.
  const partnerHistory: Record<string, number> = { ...(round.partnerHistory ?? {}) };
  const opponentHistory: Record<string, number> = { ...(round.opponentHistory ?? {}) };

  // Remove original match partnerships
  for (const m of (round.matches ?? []) as { teamA: [string, string]; teamB: [string, string] }[]) {
    const pk1 = pairKey(m.teamA[0], m.teamA[1]);
    partnerHistory[pk1] = Math.max(0, (partnerHistory[pk1] ?? 0) - 1);
    if (partnerHistory[pk1] === 0) delete partnerHistory[pk1];

    const pk2 = pairKey(m.teamB[0], m.teamB[1]);
    partnerHistory[pk2] = Math.max(0, (partnerHistory[pk2] ?? 0) - 1);
    if (partnerHistory[pk2] === 0) delete partnerHistory[pk2];

    const [a, b] = m.teamA;
    const [c, d] = m.teamB;
    for (const [x, y] of [[a, c], [a, d], [b, c], [b, d]] as [string, string][]) {
      const ok = pairKey(x, y);
      opponentHistory[ok] = Math.max(0, (opponentHistory[ok] ?? 0) - 1);
      if (opponentHistory[ok] === 0) delete opponentHistory[ok];
    }
  }

  // Add new match partnerships
  for (const m of matches) {
    const pk1 = pairKey(m.teamA[0], m.teamA[1]);
    partnerHistory[pk1] = (partnerHistory[pk1] ?? 0) + 1;

    const pk2 = pairKey(m.teamB[0], m.teamB[1]);
    partnerHistory[pk2] = (partnerHistory[pk2] ?? 0) + 1;

    const [a, b] = m.teamA;
    const [c, d] = m.teamB;
    for (const [x, y] of [[a, c], [a, d], [b, c], [b, d]] as [string, string][]) {
      const ok = pairKey(x, y);
      opponentHistory[ok] = (opponentHistory[ok] ?? 0) + 1;
    }
  }

  const updatedRound = {
    ...round,
    matches: matches.map((m) => ({
      teamA: m.teamA,
      teamB: m.teamB,
      scoreA: null as number | null,
      scoreB: null as number | null,
    })),
    sitting,
    partnerHistory,
    opponentHistory,
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
