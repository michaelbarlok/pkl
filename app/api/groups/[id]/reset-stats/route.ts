import { requireAuth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/groups/[id]/reset-stats
 *
 * Resets the free-play W/L records and point differentials by setting
 * stats_reset_at to now().  Existing match data is preserved but
 * the view filters it out.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: groupId } = await params;

  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  // Verify caller is a member
  const { data: membership } = await auth.supabase
    .from("group_memberships")
    .select("player_id")
    .eq("group_id", groupId)
    .eq("player_id", auth.profile.id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "Not a group member" }, { status: 403 });
  }

  const { error } = await auth.supabase
    .from("shootout_groups")
    .update({ stats_reset_at: new Date().toISOString() })
    .eq("id", groupId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: "Stats reset" });
}
