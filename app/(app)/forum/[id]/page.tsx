"use client";

import { useSupabase } from "@/components/providers/supabase-provider";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

interface Thread {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  created_at: string;
  author: { display_name: string; avatar_url: string | null };
}

interface Reply {
  id: string;
  body: string;
  created_at: string;
  author: { display_name: string; avatar_url: string | null };
}

export default function ThreadPage() {
  const { id } = useParams<{ id: string }>();
  const { supabase } = useSupabase();
  const [thread, setThread] = useState<Thread | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [replyBody, setReplyBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function fetchData() {
    const { data: t } = await supabase
      .from("forum_threads")
      .select("*, author:profiles(display_name, avatar_url)")
      .eq("id", id)
      .single();
    setThread(t as Thread);

    const { data: r } = await supabase
      .from("forum_replies")
      .select("*, author:profiles(display_name, avatar_url)")
      .eq("thread_id", id)
      .order("created_at", { ascending: true });
    setReplies((r as Reply[]) ?? []);
    setLoading(false);
  }

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!profile) return;

    const { error } = await supabase.from("forum_replies").insert({
      thread_id: id,
      author_id: profile.id,
      body: replyBody,
    });

    if (!error) {
      setReplyBody("");
      await fetchData();

      // Trigger notification to thread author
      if (thread) {
        await fetch("/api/forum/reply-notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ threadId: id }),
        });
      }
    }

    setSubmitting(false);
  }

  if (loading) return <div className="text-center py-12 text-surface-muted">Loading...</div>;
  if (!thread) return <div className="text-center py-12 text-surface-muted">Thread not found.</div>;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Thread */}
      <div className="card">
        <div className="flex items-center gap-2 mb-2">
          {thread.pinned && <span className="badge-blue text-xs">Pinned</span>}
          <h1 className="text-xl font-bold text-dark-100">{thread.title}</h1>
        </div>
        <div className="flex items-center gap-2 text-sm text-surface-muted mb-4">
          {thread.author?.avatar_url ? (
            <img src={thread.author.avatar_url} alt="" className="h-6 w-6 rounded-full" />
          ) : (
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-900/50 text-brand-300 text-xs">
              {thread.author?.display_name?.charAt(0).toUpperCase()}
            </div>
          )}
          <span>{thread.author?.display_name}</span>
          <span>·</span>
          <span>
            {new Date(thread.created_at).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
        </div>
        <div className="prose prose-sm max-w-none text-dark-200 whitespace-pre-wrap">
          {thread.body}
        </div>
      </div>

      {/* Replies */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-dark-200">
          {replies.length} {replies.length === 1 ? "Reply" : "Replies"}
        </h2>
        {replies.map((reply) => (
          <div key={reply.id} className="card">
            <div className="flex items-center gap-2 text-sm text-surface-muted mb-2">
              {reply.author?.avatar_url ? (
                <img src={reply.author.avatar_url} alt="" className="h-5 w-5 rounded-full" />
              ) : (
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-overlay text-surface-muted text-xs">
                  {reply.author?.display_name?.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="font-medium text-dark-200">{reply.author?.display_name}</span>
              <span>·</span>
              <span>
                {new Date(reply.created_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
            </div>
            <p className="text-sm text-dark-200 whitespace-pre-wrap">{reply.body}</p>
          </div>
        ))}
      </div>

      {/* Reply Form */}
      <form onSubmit={handleReply} className="card space-y-3">
        <textarea
          value={replyBody}
          onChange={(e) => setReplyBody(e.target.value)}
          className="input min-h-[100px]"
          placeholder="Write a reply..."
          maxLength={2000}
          required
        />
        <button type="submit" className="btn-primary" disabled={submitting || !replyBody.trim()}>
          {submitting ? "Posting..." : "Post Reply"}
        </button>
      </form>
    </div>
  );
}
