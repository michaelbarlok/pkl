import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

/**
 * PATCH /api/groups/[id]/settings
 *
 * Update group-level settings. Currently supports:
 * - rolling_sessions_count: number of sessions for the stats rolling window
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: groupId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  // Verify caller is a group member with admin role
  const { data: membership } = await supabase
    .from("group_memberships")
    .select("group_role")
    .eq("group_id", groupId)
    .eq("player_id", profile.id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "Not a group member" }, { status: 403 });
  }

  if (membership.group_role !== "admin") {
    return NextResponse.json({ error: "Only group admins can update settings" }, { status: 403 });
  }

  const body = await request.json();
  const updates: Record<string, unknown> = {};

  if (typeof body.rolling_sessions_count === "number") {
    const val = Math.floor(body.rolling_sessions_count);
    if (val < 1 || val > 100) {
      return NextResponse.json(
        { error: "rolling_sessions_count must be between 1 and 100" },
        { status: 400 }
      );
    }
    updates.rolling_sessions_count = val;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { error } = await supabase
    .from("shootout_groups")
    .update(updates)
    .eq("id", groupId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: "Settings updated" });
}
