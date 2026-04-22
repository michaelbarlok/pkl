import { requireAuth, isGroupAdmin } from "@/lib/auth";
import { notifyMany } from "@/lib/notify";
import { createServiceClient } from "@/lib/supabase/server";
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
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 2000) : "";

  if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });
  if (!message) return NextResponse.json({ error: "Message is required" }, { status: 400 });

  // Optional attachment metadata — we only accept URLs from our own
  // Supabase storage bucket to prevent admins (or a spoofed client)
  // from embedding arbitrary external links in a broadcast.
  let attachmentUrl: string | null = null;
  let attachmentType: string | null = null;
  let attachmentName: string | null = null;
  if (body.attachment && typeof body.attachment === "object") {
    const { url, type, name } = body.attachment as { url?: unknown; type?: unknown; name?: unknown };
    if (typeof url !== "string" || typeof type !== "string" || typeof name !== "string") {
      return NextResponse.json({ error: "Invalid attachment" }, { status: 400 });
    }
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const expectedPrefix = `${supabaseUrl}/storage/v1/object/public/announcement-attachments/`;
    if (!supabaseUrl || !url.startsWith(expectedPrefix)) {
      return NextResponse.json({ error: "Attachment must live in our storage bucket" }, { status: 400 });
    }
    attachmentUrl = url;
    attachmentType = type.slice(0, 100);
    attachmentName = name.slice(0, 200);
  }

  // Fetch group info — we need `slug` to build the deep-link that the
  // notification "View" button + push click target.
  const { data: group } = await auth.supabase
    .from("shootout_groups")
    .select("name, slug")
    .eq("id", groupId)
    .single();

  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  // Persist the announcement so notifications can deep-link to it. We
  // use the service client because notifyMany writes via service too
  // and we want this row to land even if the caller's RLS is edgy.
  const serviceClient = await createServiceClient();
  const { data: announcement, error: insertErr } = await serviceClient
    .from("group_announcements")
    .insert({
      group_id: groupId,
      sent_by: auth.profile.id,
      title,
      body: message,
      attachment_url: attachmentUrl,
      attachment_type: attachmentType,
      attachment_name: attachmentName,
    })
    .select("id")
    .single();

  if (insertErr || !announcement) {
    return NextResponse.json(
      { error: insertErr?.message ?? "Failed to record announcement" },
      { status: 500 }
    );
  }

  // Fetch all active member player_ids
  const { data: memberships } = await auth.supabase
    .from("group_memberships")
    .select("player_id")
    .eq("group_id", groupId);

  const playerIds = (memberships ?? []).map((m: { player_id: string }) => m.player_id);

  if (playerIds.length === 0) {
    return NextResponse.json({ sent: 0, announcementId: announcement.id });
  }

  await notifyMany(playerIds, {
    type: "group_announcement",
    title,
    body: message,
    link: `/groups/${group.slug}/announcements/${announcement.id}`,
    groupId,
    emailTemplate: "GroupAnnouncement",
    emailData: {
      groupName: group.name,
      title,
      message,
      attachmentUrl: attachmentUrl ?? undefined,
      attachmentName: attachmentName ?? undefined,
      attachmentType: attachmentType ?? undefined,
    },
  });

  return NextResponse.json({ sent: playerIds.length, announcementId: announcement.id });
}
