import { requireAuth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/groups/[id]/sessions/[sessionId]/matches
 *
 * Returns all persisted matches for a session, ordered by round then insertion order.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> }
) {
  const { id: groupId, sessionId } = await params;

  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { data: matches, error } = await auth.supabase
    .from("free_play_matches")
    .select("id, round_number, team_a_p1, team_a_p2, team_b_p1, team_b_p2, score_a, score_b")
    .eq("session_id", sessionId)
    .eq("group_id", groupId)
    .order("round_number", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ matches: matches ?? [] });
}
