import { createServiceClient } from "@/lib/supabase/server";
import { requireAuth, isGroupAdmin } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const { playerId, groupId, groupRole } = body;

  if (!playerId || !groupId || !["admin", "member"].includes(groupRole)) {
    return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
  }

  // Allow global admins OR group admins of the target group
  const canManage = await isGroupAdmin(auth.supabase, auth.profile.id, groupId, auth.profile.role);
  if (!canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = await createServiceClient();

  // Update the group_role on the membership
  const { error } = await admin
    .from("group_memberships")
    .update({ group_role: groupRole })
    .eq("player_id", playerId)
    .eq("group_id", groupId);

  if (error) {
    // If column doesn't exist yet (migration not applied), return a helpful message
    if (error.message.includes("group_role")) {
      return NextResponse.json(
        { error: "The group_role column has not been added yet. Please apply migration 012_group_admin_role.sql." },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
