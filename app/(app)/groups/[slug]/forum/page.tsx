"use client";

import { useSupabase } from "@/components/providers/supabase-provider";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { formatDate } from "@/lib/utils";

interface Thread {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  created_at: string;
  group_id: string;
  author: { display_name: string; avatar_url: string | null } | null;
}

interface Group {
  id: string;
  name: string;
  slug: string;
}

export default function GroupForumPage() {
  const { slug } = useParams<{ slug: string }>();
  const { supabase } = useSupabase();

  const [group, setGroup] = useState<Group | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [replyCounts, setReplyCounts] = useState<Map<string, number>>(new Map());
  const [pollThreadIds, setPollThreadIds] = useState<Set<string>>(new Set());
  const [isGroupAdmin, setIsGroupAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  // Bulk-select state
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  async function fetchData() {
    setLoading(true);

    const { data: grp } = await supabase
      .from("shootout_groups")
      .select("id, name, slug")
      .eq("slug", slug)
      .single();

    if (!grp) {
      setLoading(false);
      return;
    }
    setGroup(grp);

    // Determine admin status
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, role")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profile) {
        if (profile.role === "admin") {
          setIsGroupAdmin(true);
        } else {
          const { data: membership } = await supabase
            .from("group_memberships")
            .select("group_role")
            .eq("group_id", grp.id)
            .eq("player_id", profile.id)
            .maybeSingle();
          setIsGroupAdmin(membership?.group_role === "admin");
        }
      }
    }

    // Threads
    const { data: threadData } = await supabase
      .from("forum_threads")
      .select("*, author:profiles(display_name, avatar_url)")
      .eq("group_id", grp.id)
      .is("deleted_at", null)
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(50);

    const ts = (threadData as Thread[]) ?? [];
    setThreads(ts);

    const ids = ts.map((t) => t.id);

    // Reply counts
    const counts = new Map<string, number>();
    for (const tid of ids) {
      const { count } = await supabase
        .from("forum_replies")
        .select("*", { count: "exact", head: true })
        .eq("thread_id", tid);
      counts.set(tid, count ?? 0);
    }
    setReplyCounts(counts);

    // Polls
    if (ids.length > 0) {
      const { data: polls } = await supabase
        .from("forum_polls")
        .select("thread_id")
        .in("thread_id", ids);
      setPollThreadIds(new Set(polls?.map((p) => p.thread_id) ?? []));
    }

    setLoading(false);
  }

  async function deleteThread(threadId: string) {
    if (!window.confirm("Delete this thread? This cannot be undone.")) return;
    await supabase
      .from("forum_threads")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", threadId);
    setThreads((prev) => prev.filter((t) => t.id !== threadId));
  }

  async function deleteBulk() {
    if (selectedIds.size === 0) return;
    const n = selectedIds.size;
    if (!window.confirm(`Delete ${n} thread${n > 1 ? "s" : ""}? This cannot be undone.`)) return;

    setDeleting(true);
    const ids = Array.from(selectedIds);
    await supabase
      .from("forum_threads")
      .update({ deleted_at: new Date().toISOString() })
      .in("id", ids);

    setThreads((prev) => prev.filter((t) => !selectedIds.has(t.id)));
    setSelectedIds(new Set());
    setSelectMode(false);
    setDeleting(false);
  }

  function toggleSelect(threadId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(threadId)) next.delete(threadId);
      else next.add(threadId);
      return next;
    });
  }

  if (loading)
    return <div className="text-center py-12 text-surface-muted">Loading...</div>;
  if (!group)
    return <div className="text-center py-12 text-surface-muted">Group not found.</div>;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-surface-muted">
        <Link href="/groups" className="hover:text-dark-200">
          Groups
        </Link>
        <span>/</span>
        <Link href={`/groups/${slug}`} className="hover:text-dark-200">
          {group.name}
        </Link>
        <span>/</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-dark-100">Forum</h1>
        <div className="flex items-center gap-2">
          {isGroupAdmin && threads.length > 0 && (
            selectMode ? (
              <>
                <button
                  onClick={deleteBulk}
                  disabled={selectedIds.size === 0 || deleting}
                  className="btn-danger text-sm"
                >
                  {deleting
                    ? "Deleting..."
                    : selectedIds.size > 0
                    ? `Delete (${selectedIds.size})`
                    : "Delete"}
                </button>
                <button
                  onClick={() => {
                    setSelectMode(false);
                    setSelectedIds(new Set());
                  }}
                  className="btn-secondary text-sm"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                onClick={() => setSelectMode(true)}
                className="btn-secondary text-sm"
              >
                Select
              </button>
            )
          )}
          <Link href={`/groups/${slug}/forum/new`} className="btn-primary">
            New Thread
          </Link>
        </div>
      </div>

      {/* Thread list */}
      <div className="space-y-3">
        {threads.map((thread) =>
          selectMode ? (
            /* ── Selection mode: checkbox + card ── */
            <div
              key={thread.id}
              onClick={() => toggleSelect(thread.id)}
              className={`card cursor-pointer transition-all ${
                selectedIds.has(thread.id) ? "ring-2 ring-red-500/60" : ""
              }`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={selectedIds.has(thread.id)}
                  onChange={() => toggleSelect(thread.id)}
                  onClick={(e) => e.stopPropagation()}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-surface-border text-red-500 focus:ring-red-500"
                />
                <ThreadSummary
                  thread={thread}
                  groupName={group.name}
                  replyCounts={replyCounts}
                  pollThreadIds={pollThreadIds}
                />
              </div>
            </div>
          ) : (
            /* ── Normal mode: link + optional trash button ── */
            <div key={thread.id} className="flex items-start gap-2">
              <Link
                href={`/groups/${slug}/forum/${thread.id}`}
                className="card flex-1 block hover:ring-brand-500/30 transition-shadow"
              >
                <ThreadSummary
                  thread={thread}
                  groupName={group.name}
                  replyCounts={replyCounts}
                  pollThreadIds={pollThreadIds}
                />
              </Link>
              {isGroupAdmin && (
                <button
                  onClick={() => deleteThread(thread.id)}
                  title="Delete thread"
                  className="mt-2 p-1.5 text-surface-muted hover:text-red-400 transition-colors shrink-0"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              )}
            </div>
          )
        )}

        {threads.length === 0 && (
          <div className="text-center py-12 text-surface-muted">
            No threads yet. Start the conversation!
          </div>
        )}
      </div>
    </div>
  );
}

// ── Shared thread summary card content ────────────────────────────────────────

function ThreadSummary({
  thread,
  groupName,
  replyCounts,
  pollThreadIds,
}: {
  thread: Thread;
  groupName: string;
  replyCounts: Map<string, number>;
  pollThreadIds: Set<string>;
}) {
  return (
    <div className="flex-1">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="badge-blue text-xs">{groupName}</span>
        {thread.pinned && <span className="badge-yellow text-xs">Pinned</span>}
        {pollThreadIds.has(thread.id) && (
          <span className="badge-green text-xs">Poll</span>
        )}
        <h2 className="text-sm font-semibold text-dark-100">{thread.title}</h2>
      </div>
      <p className="mt-1 text-sm text-surface-muted line-clamp-2">{thread.body}</p>
      <div className="mt-2 flex items-center gap-3 text-xs text-surface-muted">
        <span>{thread.author?.display_name}</span>
        <span>{formatDate(thread.created_at)}</span>
        <span>{replyCounts.get(thread.id) ?? 0} replies</span>
      </div>
    </div>
  );
}
