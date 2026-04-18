import { requireAuth } from "@/lib/auth";
import { generateRound, pairKey } from "@/lib/free-play-engine";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/groups/[id]/sessions/[sessionId]/next-round
 *
 * Persists the scored matches from the current round, then generates
 * the next round and updates the session.
 *
 * Body: { scores: { scoreA: number, scoreB: number }[] }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> }
) {
  const { id: groupId, sessionId } = await params;
  const body = await request.json();
  const { scores } = body as { scores: { scoreA: number; scoreB: number }[] };

  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  // Get session
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

  const round = session.current_round as any;
  if (!round || !scores || scores.length !== round.matches.length) {
    return NextResponse.json(
      { error: "Scores must be provided for all matches" },
      { status: 400 }
    );
  }

  // Persist scored matches to free_play_matches
  const matchRows = round.matches.map((m: any, i: number) => ({
    group_id: groupId,
    created_by: auth.profile.id,
    session_id: sessionId,
    round_number: round.roundNumber,
    team_a_p1: m.teamA[0],
    team_a_p2: m.teamA[1],
    team_b_p1: m.teamB[0],
    team_b_p2: m.teamB[1],
    score_a: scores[i].scoreA,
    score_b: scores[i].scoreB,
  }));

  const { error: insertError } = await auth.supabase
    .from("free_play_matches")
    .insert(matchRows);

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // Get checked-in players
  const { data: sessionPlayers } = await auth.supabase
    .from("free_play_session_players")
    .select("player_id")
    .eq("session_id", sessionId);

  const playerIds = (sessionPlayers ?? []).map((sp) => sp.player_id);

  // Restore histories from stored round state
  const partnerHistory: Record<string, number> = { ...(round.partnerHistory ?? {}) };
  const opponentHistory: Record<string, number> = { ...(round.opponentHistory ?? {}) };
  const previousSitting: string[] = round.sitting ?? [];

  // Update bye history with this round's sitters BEFORE generating next round
  // so the algorithm can prefer players who've had fewer total byes
  const byeHistory: Record<string, number> = { ...(round.byeHistory ?? {}) };
  for (const p of previousSitting) {
    byeHistory[p] = (byeHistory[p] ?? 0) + 1;
  }

  const nextRound = generateRound(playerIds, previousSitting, partnerHistory, byeHistory, opponentHistory);

  // Update partner and opponent history for the newly generated round
  for (const m of nextRound.matches) {
    const pk1 = pairKey(m.teamA[0], m.teamA[1]);
    partnerHistory[pk1] = (partnerHistory[pk1] ?? 0) + 1;
    const pk2 = pairKey(m.teamB[0], m.teamB[1]);
    partnerHistory[pk2] = (partnerHistory[pk2] ?? 0) + 1;

    const [a, b] = m.teamA;
    const [c, d] = m.teamB;
    for (const [x, y] of [[a, c], [a, d], [b, c], [b, d]] as [string, string][]) {
      const k = pairKey(x, y);
      opponentHistory[k] = (opponentHistory[k] ?? 0) + 1;
    }
  }

  const newRoundNumber = round.roundNumber + 1;
  const currentRound = {
    roundNumber: newRoundNumber,
    matches: nextRound.matches.map((m) => ({
      teamA: m.teamA,
      teamB: m.teamB,
      scoreA: null as number | null,
      scoreB: null as number | null,
    })),
    sitting: nextRound.sitting,
    partnerHistory,
    opponentHistory,
    byeHistory,
  };

  const { data: updated, error: updateError } = await auth.supabase
    .from("free_play_sessions")
    .update({ current_round: currentRound, round_number: newRoundNumber })
    .eq("id", sessionId)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json(updated);
}
