import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { formatDate } from "@/lib/utils";

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
                    {!thread.pinned && Date.now() - new Date(thread.created_at).getTime() < 86400000 && (
                      <span className="inline-flex h-2 w-2 rounded-full bg-brand-400" title="New thread" />
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
                      {formatDate(thread.created_at)}
                    </span>
                    <span>{replyCounts.get(thread.id) ?? 0} replies</span>
                  </div>
                </div>
              </div>
            </Link>
          );
        })}

        {(!threads || threads.length === 0) && (
          <div className="card text-center py-12 space-y-3">
            <div className="flex justify-center text-surface-muted">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-12 w-12">
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 0 1-.825-.242m9.345-8.334a2.126 2.126 0 0 0-.476-.095 48.64 48.64 0 0 0-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0 0 11.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
              </svg>
            </div>
            <p className="font-medium text-dark-100">
              {groups.length === 0 ? "No forum access yet" : "No threads yet"}
            </p>
            <p className="text-sm text-surface-muted">
              {groups.length === 0
                ? "Join a group to participate in forum discussions."
                : "Start the conversation!"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
