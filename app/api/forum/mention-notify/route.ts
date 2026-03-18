import { requireAuth } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { notify } from "@/lib/notify";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { threadId, groupId, mentionedNames } = await request.json();

  if (!threadId || !groupId || !mentionedNames?.length) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  // Get thread info
  const { data: thread } = await auth.supabase
    .from("forum_threads")
    .select("title")
    .eq("id", threadId)
    .single();

  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  // Get group slug for email link
  const serviceClient = await createServiceClient();
  const { data: group } = await serviceClient
    .from("shootout_groups")
    .select("slug")
    .eq("id", groupId)
    .single();

  // Get mentioner's display name
  const { data: mentionerProfile } = await auth.supabase
    .from("profiles")
    .select("display_name")
    .eq("id", auth.profile.id)
    .single();

  const mentionerName = mentionerProfile?.display_name ?? "Someone";

  // Look up profiles by display_name (case-insensitive match)
  // Only notify members of the group
  const { data: groupMembers } = await serviceClient
    .from("group_memberships")
    .select("player_id, player:profiles(id, display_name)")
    .eq("group_id", groupId);

  if (!groupMembers) {
    return NextResponse.json({ status: "no_members" });
  }

  const notified: string[] = [];

  for (const name of mentionedNames as string[]) {
    const member = groupMembers.find(
      (m: any) =>
        m.player?.display_name?.toLowerCase() === name.toLowerCase()
    );

    if (!member || !member.player_id) continue;

    await notify({
      profileId: member.player_id,
      type: "forum_mention",
      title: `${mentionerName} mentioned you`,
      body: `You were mentioned in "${thread.title}"`,
      link: `/groups/${group?.slug ?? ""}/forum/${threadId}`,
      groupId,
      emailTemplate: "ForumMention",
      emailData: {
        threadTitle: thread.title,
        threadId,
        mentionedBy: mentionerName,
        groupSlug: group?.slug,
      },
    });

    notified.push(name);
  }

  return NextResponse.json({ status: "notified", notified });
}
