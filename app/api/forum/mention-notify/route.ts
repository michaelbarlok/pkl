import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";
import { notify } from "@/lib/notify";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { threadId, groupId, mentionedNames } = await request.json();

  if (!threadId || !groupId || !mentionedNames?.length) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  // Get thread info
  const { data: thread } = await supabase
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

  // Get current user (the one doing the mentioning)
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let mentionerName = "Someone";
  let mentionerProfileId: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, display_name")
      .eq("user_id", user.id)
      .single();
    if (profile) {
      mentionerName = profile.display_name;
      mentionerProfileId = profile.id;
    }
  }

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
    // Don't notify the person who wrote the mention
    if (member.player_id === mentionerProfileId) continue;

    await notify({
      userId: member.player_id,
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
