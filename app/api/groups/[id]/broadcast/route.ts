import { requireAuth, isGroupAdmin } from "@/lib/auth";
import { notifyMany } from "@/lib/notify";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { id: groupId } = await params;

  const canManage = await isGroupAdmin(auth.supabase, auth.profile.id, groupId, auth.profile.role);
  if (!canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 100) : "";
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 1000) : "";

  if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });
  if (!message) return NextResponse.json({ error: "Message is required" }, { status: 400 });

  // Fetch group info
  const { data: group } = await auth.supabase
    .from("shootout_groups")
    .select("name")
    .eq("id", groupId)
    .single();

  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  // Fetch all active member player_ids
  const { data: memberships } = await auth.supabase
    .from("group_memberships")
    .select("player_id")
    .eq("group_id", groupId);

  const playerIds = (memberships ?? []).map((m: { player_id: string }) => m.player_id);

  if (playerIds.length === 0) {
    return NextResponse.json({ sent: 0 });
  }

  await notifyMany(playerIds, {
    type: "group_announcement",
    title,
    body: message,
    link: `/groups/${groupId}`,
    groupId,
    emailTemplate: "GroupAnnouncement",
    emailData: { groupName: group.name, title, message },
  });

  return NextResponse.json({ sent: playerIds.length });
}
