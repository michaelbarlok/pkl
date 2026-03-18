import { requireAuth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/groups/[id]/sessions/[sessionId]/end
 *
 * Persists the final round's scores (if any), marks the session
 * as completed, and returns the session.
 *
 * Body: { scores?: { scoreA: number, scoreB: number }[] }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> }
) {
  const { id: groupId, sessionId } = await params;
  const body = await request.json().catch(() => ({}));
  const { scores } = body as { scores?: { scoreA: number; scoreB: number }[] };

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

  // If scores provided for the current round, persist them first
  if (scores && round && scores.length === round.matches.length) {
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

    await auth.supabase.from("free_play_matches").insert(matchRows);
  }

  // Mark session as completed
  const { data: updated, error: updateError } = await auth.supabase
    .from("free_play_sessions")
    .update({
      status: "completed",
      ended_at: new Date().toISOString(),
      current_round: null,
    })
    .eq("id", sessionId)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json(updated);
}
