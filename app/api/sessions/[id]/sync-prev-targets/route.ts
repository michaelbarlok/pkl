import { requireAuth, isGroupAdmin } from "@/lib/auth";
import { recomputeSessionStats } from "@/lib/session-recompute";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/sessions/[id]/sync-prev-targets
 *
 * Defensive auto-heal for one-up-one-down anchoring on a same-day
 * continuation. Idempotent. Called silently from the seed flow so an
 * admin who hits "Seed Players" doesn't have to think about whether
 * the previous session's recompute happened — the system makes it
 * happen here.
 *
 * Steps:
 * 1. Verify this session is a same-day continuation with a prev_session_id.
 * 2. Run recomputeSessionStats on the previous session. If pool_finish /
 *    target_court_next were already set, this is a no-op (the underlying
 *    update_steps_on_round_complete RPC was made idempotent in 079).
 * 3. Read the previous session's target_court_next per player.
 * 4. Stamp each value onto the matching participant row in this session.
 *
 * Returns { synced: <count of rows updated> } so the caller can decide
 * whether to refresh local state.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { id: sessionId } = await params;

  const { data: session } = await auth.supabase
    .from("shootout_sessions")
    .select("id, group_id, is_same_day_continuation, prev_session_id")
    .eq("id", sessionId)
    .single();

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const canManage = await isGroupAdmin(
    auth.supabase,
    auth.profile.id,
    session.group_id,
    auth.profile.role
  );
  if (!canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!session.is_same_day_continuation || !session.prev_session_id) {
    return NextResponse.json({ synced: 0, reason: "not_a_continuation" });
  }

  // Make sure the previous session's targets are computed.
  const r = await recomputeSessionStats(auth.supabase, session.prev_session_id);
  if (!r.ok) {
    return NextResponse.json({ error: r.error }, { status: 500 });
  }

  // Read targets from the previous session.
  const { data: prevParts } = await auth.supabase
    .from("session_participants")
    .select("player_id, target_court_next")
    .eq("session_id", session.prev_session_id)
    .not("target_court_next", "is", null);

  if (!prevParts || prevParts.length === 0) {
    // Recompute didn't produce targets — likely no scored games on the
    // previous session. Nothing we can do here; let the seeder fall
    // back to ranking-sheet sort, which is the right behavior when
    // there's no actual round to anchor against.
    return NextResponse.json({ synced: 0, reason: "prev_has_no_targets" });
  }

  // Stamp each target onto the matching row in this session.
  let synced = 0;
  for (const p of prevParts) {
    if (p.target_court_next == null) continue;
    const { error } = await auth.supabase
      .from("session_participants")
      .update({ target_court_next: p.target_court_next })
      .eq("session_id", sessionId)
      .eq("player_id", p.player_id);
    if (!error) synced++;
  }

  return NextResponse.json({ synced });
}
