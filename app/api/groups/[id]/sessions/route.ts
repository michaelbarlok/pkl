import { requireAuth } from "@/lib/auth";
import { generateRound, pairKey } from "@/lib/free-play-engine";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/groups/[id]/sessions
 *
 * Creates a new free-play session, checks in the provided players,
 * generates the first round, and returns the session.
 *
 * Body: { playerIds: string[] }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: groupId } = await params;
  const body = await request.json();
  const { playerIds } = body as { playerIds: string[] };

  if (!playerIds || playerIds.length < 4) {
    return NextResponse.json(
      { error: "At least 4 players are required to start a session" },
      { status: 400 }
    );
  }

  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  // Verify group is free_play and caller is a member
  const { data: group } = await auth.supabase
    .from("shootout_groups")
    .select("group_type")
    .eq("id", groupId)
    .single();

  if (!group || group.group_type !== "free_play") {
    return NextResponse.json({ error: "Not a free play group" }, { status: 400 });
  }

  const { data: membership } = await auth.supabase
    .from("group_memberships")
    .select("player_id")
    .eq("group_id", groupId)
    .eq("player_id", auth.profile.id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "Not a group member" }, { status: 403 });
  }

  // Check for existing active session
  const { data: existing } = await auth.supabase
    .from("free_play_sessions")
    .select("id")
    .eq("group_id", groupId)
    .eq("status", "active")
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: "An active session already exists for this group" },
      { status: 409 }
    );
  }

  // Generate first round
  const round = generateRound(playerIds, [], {});
  const partnerHistory: Record<string, number> = {};
  for (const m of round.matches) {
    partnerHistory[pairKey(m.teamA[0], m.teamA[1])] = 1;
    partnerHistory[pairKey(m.teamB[0], m.teamB[1])] = 1;
  }

  const currentRound = {
    roundNumber: 1,
    matches: round.matches.map((m) => ({
      teamA: m.teamA,
      teamB: m.teamB,
      scoreA: null as number | null,
      scoreB: null as number | null,
    })),
    sitting: round.sitting,
    partnerHistory,
    previousSitting: round.sitting,
  };

  // Create session
  const { data: session, error: sessionError } = await auth.supabase
    .from("free_play_sessions")
    .insert({
      group_id: groupId,
      created_by: auth.profile.id,
      status: "active",
      round_number: 1,
      current_round: currentRound,
    })
    .select()
    .single();

  if (sessionError || !session) {
    return NextResponse.json(
      { error: sessionError?.message ?? "Failed to create session" },
      { status: 500 }
    );
  }

  // Insert checked-in players
  const playerRows = playerIds.map((pid) => ({
    session_id: session.id,
    player_id: pid,
  }));

  await auth.supabase.from("free_play_session_players").insert(playerRows);

  return NextResponse.json(session, { status: 201 });
}
