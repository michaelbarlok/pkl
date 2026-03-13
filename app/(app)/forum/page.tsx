import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export default async function ForumPage() {
  const supabase = await createClient();

  const { data: threads } = await supabase
    .from("forum_threads")
    .select("*, author:profiles(display_name, avatar_url)")
    .is("deleted_at", null)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(50);

  // Get reply counts
  const threadIds = (threads ?? []).map((t) => t.id);
  const replyCounts = new Map<string, number>();

  if (threadIds.length > 0) {
    for (const threadId of threadIds) {
      const { count } = await supabase
        .from("forum_replies")
        .select("*", { count: "exact", head: true })
        .eq("thread_id", threadId);
      replyCounts.set(threadId, count ?? 0);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-dark-100">Forum</h1>
        <Link href="/forum/new" className="btn-primary">
          New Thread
        </Link>
      </div>

      <div className="space-y-3">
        {threads?.map((thread) => (
          <Link
            key={thread.id}
            href={`/forum/${thread.id}`}
            className="card block hover:ring-brand-500/30 transition-shadow"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  {thread.pinned && (
                    <span className="badge-blue text-xs">Pinned</span>
                  )}
                  <h2 className="text-sm font-semibold text-dark-100">
                    {thread.title}
                  </h2>
                </div>
                <p className="mt-1 text-sm text-surface-muted line-clamp-2">
                  {thread.body}
                </p>
                <div className="mt-2 flex items-center gap-3 text-xs text-surface-muted">
                  <span>{thread.author?.display_name}</span>
                  <span>
                    {new Date(thread.created_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                  <span>{replyCounts.get(thread.id) ?? 0} replies</span>
                </div>
              </div>
            </div>
          </Link>
        ))}

        {(!threads || threads.length === 0) && (
          <div className="text-center py-12 text-surface-muted">
            No threads yet. Start the conversation!
          </div>
        )}
      </div>
    </div>
  );
}
