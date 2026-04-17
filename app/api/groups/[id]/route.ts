export const dynamic = "force-dynamic";

import { createServiceClient } from "@/lib/supabase/server";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

/**
 * DELETE /api/groups/[id]
 *
 * Deletes a group and stops all associated notifications:
 * 1. Cancels all future signup sheets so cron reminder jobs won't fire for them.
 * 2. Deletes the group — cascades clean up memberships, recurring schedule,
 *    preferences, invites, and everything else tied to the group.
 *
 * Only app-level admins may call this endpoint.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  // Verify caller is an app admin
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const service = await createServiceClient();

  // Cancel all future signup sheets so cron reminders won't fire for them.
  // Sheets without cascade need explicit cleanup before the group is deleted.
  const today = new Date().toISOString().split("T")[0];
  await service
    .from("signup_sheets")
    .update({ status: "cancelled" })
    .eq("group_id", id)
    .gte("event_date", today)
    .neq("status", "cancelled");

  // Delete all signup sheets for this group (no FK cascade exists).
  const { error: sheetsErr } = await service
    .from("signup_sheets")
    .delete()
    .eq("group_id", id);

  if (sheetsErr) {
    return NextResponse.json({ error: sheetsErr.message }, { status: 500 });
  }

  // Delete the group — cascades handle memberships, recurring schedules,
  // preferences, invites, pending members, forum threads, etc.
  const { error: groupErr } = await service
    .from("shootout_groups")
    .delete()
    .eq("id", id);

  if (groupErr) {
    return NextResponse.json({ error: groupErr.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: true });
}
