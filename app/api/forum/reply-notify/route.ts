import { requireAuth } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { notify } from "@/lib/notify";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { threadId } = await request.json();

  const { data: thread } = await auth.supabase
    .from("forum_threads")
    .select("author_id, title, group_id, author:profiles!forum_threads_author_id_fkey(notify_forum_replies)")
    .eq("id", threadId)
    .single();

  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  // Don't notify if the replier is the thread author
  if (auth.profile.id === thread.author_id) {
    return NextResponse.json({ status: "skipped" });
  }

  // Respect the author's opt-in preference (default off)
  if (!(thread.author as any)?.notify_forum_replies) {
    return NextResponse.json({ status: "skipped" });
  }

  // Get group slug for proper link
  const serviceClient = await createServiceClient();
  const { data: group } = await serviceClient
    .from("shootout_groups")
    .select("slug")
    .eq("id", thread.group_id)
    .single();

  const link = group
    ? `/groups/${group.slug}/forum/${threadId}`
    : `/forum/${threadId}`;

  await notify({
    profileId: thread.author_id,
    type: "forum_reply",
    title: "New reply to your thread",
    body: `Someone replied to "${thread.title}"`,
    link,
    groupId: thread.group_id,
    emailTemplate: "ForumReply",
    emailData: { threadTitle: thread.title, threadId },
  });

  return NextResponse.json({ status: "notified" });
}
