import { requireAdmin } from "@/lib/auth";
import { recomputeSessionStats } from "@/lib/session-recompute";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/sessions/[id]/recompute
 *
 * Re-derive pool_finish, win_pct, step_after, and target_court_next from
 * the current `game_results` rows for this session. Called after an admin
 * edits a score on a round_complete or session_complete session so the
 * stats stay consistent with the corrected scores.
 *
 * For an active session (round_active) we re-do the win_pct and
 * pool_finish pieces but skip the step movement — steps legitimately
 * move only at round completion, not mid-round.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { id: sessionId } = await params;

  const { data: session } = await auth.supabase
    .from("shootout_sessions")
    .select("status")
    .eq("id", sessionId)
    .single();
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // Only re-run the step RPC when the round is already complete; it writes
  // step_after and moves current_step, and we don't want that mid-round.
  const skipSteps =
    session.status !== "round_complete" && session.status !== "session_complete";

  const result = await recomputeSessionStats(auth.supabase, sessionId, { skipSteps });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, stepsUpdated: !skipSteps });
}
