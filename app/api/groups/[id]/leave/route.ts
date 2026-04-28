import { requireAuth } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/groups/[id]/leave
 *
 * Lets a member leave a group. Their stats (current_step, win_pct,
 * total_sessions, last_played_at, imported_win_pct, signup_priority,
 * joined_at) are snapshotted into left_group_memberships so a later
 * rejoin restores them — leaving isn't punitive.
 *
 * Guard: a group admin can't leave if they are the last admin —
 * they must promote someone else first or hand the group to a
 * site admin to delete. Otherwise the group becomes unmanageable.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: groupId } = await params;

  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const service = await createServiceClient();

  const { data: membership, error: mErr } = await service
    .from("group_memberships")
    .select("*")
    .eq("group_id", groupId)
    .eq("player_id", auth.profile.id)
    .maybeSingle();

  if (mErr) {
    return NextResponse.json({ error: mErr.message }, { status: 500 });
  }
  if (!membership) {
    return NextResponse.json({ error: "Not a group member" }, { status: 404 });
  }

  // Last-admin guard.
  if (membership.group_role === "admin") {
    const { count: adminCount } = await service
      .from("group_memberships")
      .select("player_id", { count: "exact", head: true })
      .eq("group_id", groupId)
      .eq("group_role", "admin");

    if ((adminCount ?? 0) <= 1) {
      return NextResponse.json(
        {
          error:
            "You're the only admin in this group. Promote another member to admin before leaving.",
        },
        { status: 409 }
      );
    }
  }

  // Snapshot the row into the archive (upsert so a re-leave after a
  // rejoin overwrites the previous archive cleanly).
  const { error: archiveErr } = await service
    .from("left_group_memberships")
    .upsert(
      {
        group_id: groupId,
        player_id: auth.profile.id,
        current_step: membership.current_step,
        win_pct: membership.win_pct,
        total_sessions: membership.total_sessions,
        last_played_at: membership.last_played_at,
        joined_at: membership.joined_at,
        imported_win_pct: membership.imported_win_pct,
        signup_priority: membership.signup_priority ?? "normal",
        group_role: membership.group_role ?? "member",
        left_at: new Date().toISOString(),
      },
      { onConflict: "group_id,player_id" }
    );

  if (archiveErr) {
    return NextResponse.json({ error: archiveErr.message }, { status: 500 });
  }

  // Drop the active membership.
  const { error: deleteErr } = await service
    .from("group_memberships")
    .delete()
    .eq("group_id", groupId)
    .eq("player_id", auth.profile.id);

  if (deleteErr) {
    return NextResponse.json({ error: deleteErr.message }, { status: 500 });
  }

  // Withdraw from any future signup sheets in this group so the
  // viewer doesn't keep getting reminders / showing on rosters.
  const today = new Date().toISOString();
  const { data: futureSheets } = await service
    .from("signup_sheets")
    .select("id")
    .eq("group_id", groupId)
    .gte("event_time", today);

  if (futureSheets && futureSheets.length > 0) {
    await service
      .from("registrations")
      .update({ status: "withdrawn" })
      .in(
        "sheet_id",
        futureSheets.map((s: { id: string }) => s.id)
      )
      .eq("player_id", auth.profile.id)
      .in("status", ["confirmed", "waitlist"]);
  }

  revalidatePath(`/groups`);
  return NextResponse.json({ success: true });
}
