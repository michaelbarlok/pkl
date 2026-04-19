import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { formatDate } from "@/lib/utils";
import { PlayerAvatar } from "@/components/player-avatar";
import { EmptyState } from "@/components/empty-state";

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

  // Split pinned off so we can render a dedicated top block
  const pinnedThreads = (threads ?? []).filter((t) => t.pinned);
  const regularThreads = (threads ?? []).filter((t) => !t.pinned);

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-heading">Forum</h1>
          <p className="mt-1 text-sm text-surface-muted">
            Community conversations across your groups.
          </p>
        </div>
        {groups.length > 0 && (
          <Link href="/forum/new" className="btn-primary">
            New Thread
          </Link>
        )}
      </div>

      {/* Group filter chips */}
      {groupMap.size > 1 && (
        <div className="flex flex-wrap gap-2">
          {Array.from(groupMap.entries()).map(([id, g]) => (
            <Link
              key={id}
              href={`/groups/${g.slug}/forum`}
              className="inline-flex items-center gap-1 rounded-full bg-surface-raised ring-1 ring-surface-border px-3 py-1 text-xs text-dark-200 hover:ring-brand-500/30 hover:text-dark-100 transition-colors"
            >
              {g.name}
              <span className="text-surface-muted">→</span>
            </Link>
          ))}
        </div>
      )}

      {pinnedThreads.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-surface-muted">
            Pinned
          </h2>
          <div className="space-y-2">
            {pinnedThreads.map((thread) => (
              <ThreadRow
                key={thread.id}
                thread={thread}
                group={groupMap.get(thread.group_id)}
                hasPoll={pollThreadIds.has(thread.id)}
                replyCount={replyCounts.get(thread.id) ?? 0}
              />
            ))}
          </div>
        </section>
      )}

      {regularThreads.length > 0 && (
        <section className="space-y-2">
          {pinnedThreads.length > 0 && (
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-surface-muted">
              Recent
            </h2>
          )}
          {regularThreads.map((thread) => (
            <ThreadRow
              key={thread.id}
              thread={thread}
              group={groupMap.get(thread.group_id)}
              hasPoll={pollThreadIds.has(thread.id)}
              replyCount={replyCounts.get(thread.id) ?? 0}
            />
          ))}
        </section>
      )}

      {(!threads || threads.length === 0) && (
        <EmptyState
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-12 w-12">
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 0 1-.825-.242m9.345-8.334a2.126 2.126 0 0 0-.476-.095 48.64 48.64 0 0 0-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0 0 11.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
            </svg>
          }
          title={groups.length === 0 ? "No forum access yet" : "No threads yet"}
          description={
            groups.length === 0
              ? "Join a group to participate in forum discussions."
              : "Be the one to kick off the conversation."
          }
          actionLabel={groups.length === 0 ? "Browse groups" : "New thread"}
          actionHref={groups.length === 0 ? "/groups" : "/forum/new"}
        />
      )}
    </div>
  );
}

function ThreadRow({
  thread,
  group,
  hasPoll,
  replyCount,
}: {
  thread: any;
  group: { name: string; slug: string } | undefined;
  hasPoll: boolean;
  replyCount: number;
}) {
  const isNew =
    !thread.pinned &&
    Date.now() - new Date(thread.created_at).getTime() < 86400000;

  return (
    <Link
      href={`/groups/${group?.slug ?? "unknown"}/forum/${thread.id}`}
      className="card block hover:ring-brand-500/30 transition-all hover:-translate-y-0.5"
    >
      <div className="flex items-start gap-3">
        <PlayerAvatar
          displayName={thread.author?.display_name ?? ""}
          avatarUrl={thread.author?.avatar_url ?? null}
          size="md"
          className="shrink-0 mt-0.5"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {group && <span className="badge-blue text-xs">{group.name}</span>}
            {thread.pinned && <span className="badge-yellow text-xs">Pinned</span>}
            {hasPoll && <span className="badge-green text-xs">Poll</span>}
            {isNew && (
              <span
                className="inline-flex h-2 w-2 rounded-full bg-brand-400"
                title="New thread"
                aria-label="New"
              />
            )}
          </div>
          <h2 className="mt-1.5 text-sm font-semibold text-dark-100 line-clamp-1">
            {thread.title}
          </h2>
          <p className="mt-1 text-sm text-surface-muted line-clamp-2">
            {thread.body}
          </p>
          <div className="mt-2 flex items-center gap-3 text-xs text-surface-muted">
            <span className="text-dark-300">{thread.author?.display_name}</span>
            <span aria-hidden>·</span>
            <span>{formatDate(thread.created_at)}</span>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.75 9.75 0 01-4-.8L3 20l1.3-3.9A8 8 0 0112 4c4.97 0 9 3.582 9 8z" />
              </svg>
              {replyCount}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
