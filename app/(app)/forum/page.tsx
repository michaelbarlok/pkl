import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function ForumPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("user_id", user.id)
    .single();

  if (!profile) redirect("/login");

  const isAdmin = profile.role === "admin";

  // Get groups the user is a member of
  const { data: memberships } = await supabase
    .from("group_memberships")
    .select("group_id, group:shootout_groups(id, name, slug)")
    .eq("player_id", profile.id);

  const groups = (memberships ?? [])
    .map((m: any) => m.group)
    .filter(Boolean);

  // Build a map of group id -> group info for labeling
  const groupMap = new Map<string, { name: string; slug: string }>();

  if (isAdmin) {
    // Admins see all groups
    const { data: allGroups } = await supabase
      .from("shootout_groups")
      .select("id, name, slug");
    (allGroups ?? []).forEach((g) => groupMap.set(g.id, { name: g.name, slug: g.slug }));
  } else {
    groups.forEach((g: any) => groupMap.set(g.id, { name: g.name, slug: g.slug }));
  }

  // Fetch threads — RLS handles visibility (group members + admins)
  // For admins, RLS already allows seeing all threads
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

  // Check for polls
  const pollThreadIds = new Set<string>();
  if (threadIds.length > 0) {
    const { data: polls } = await supabase
      .from("forum_polls")
      .select("thread_id")
      .in("thread_id", threadIds);
    polls?.forEach((p) => pollThreadIds.add(p.thread_id));
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-dark-100">Forum</h1>
        {groups.length > 0 && (
          <Link href="/forum/new" className="btn-primary">
            New Thread
          </Link>
        )}
      </div>

      {/* Group filter chips */}
      {groupMap.size > 1 && (
        <div className="flex flex-wrap gap-2 text-xs">
          {Array.from(groupMap.entries()).map(([id, g]) => (
            <Link
              key={id}
              href={`/groups/${g.slug}/forum`}
              className="badge-gray hover:bg-surface-overlay transition-colors"
            >
              {g.name}
            </Link>
          ))}
        </div>
      )}

      <div className="space-y-3">
        {threads?.map((thread) => {
          const group = groupMap.get(thread.group_id);
          return (
            <Link
              key={thread.id}
              href={`/groups/${group?.slug ?? "unknown"}/forum/${thread.id}`}
              className="card block hover:ring-brand-500/30 transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {group && (
                      <span className="badge-blue text-xs">{group.name}</span>
                    )}
                    {thread.pinned && (
                      <span className="badge-yellow text-xs">Pinned</span>
                    )}
                    {pollThreadIds.has(thread.id) && (
                      <span className="badge-green text-xs">Poll</span>
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
          );
        })}

        {(!threads || threads.length === 0) && (
          <div className="text-center py-12 text-surface-muted">
            {groups.length === 0
              ? "Join a group to participate in forum discussions."
              : "No threads yet. Start the conversation!"}
          </div>
        )}
      </div>
    </div>
  );
}
