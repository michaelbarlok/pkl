"use client";

import { useSupabase } from "@/components/providers/supabase-provider";
import { useParams } from "next/navigation";
import { useEffect, useState, Fragment } from "react";
import Link from "next/link";

interface Thread {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  group_id: string;
  created_at: string;
  author_id: string;
  author: { display_name: string; avatar_url: string | null };
}

interface Reply {
  id: string;
  body: string;
  created_at: string;
  author: { display_name: string; avatar_url: string | null };
}

interface PollOption {
  id: string;
  label: string;
  sort_order: number;
}

interface Poll {
  id: string;
  question: string;
  anonymous: boolean;
  options: PollOption[];
}

interface VoteCount {
  option_id: string;
  count: number;
  voters: string[]; // display names, empty if anonymous
}

export default function ThreadPage() {
  const { slug, id } = useParams<{ slug: string; id: string }>();
  const { supabase } = useSupabase();
  const [thread, setThread] = useState<Thread | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [replyBody, setReplyBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [profileId, setProfileId] = useState<string | null>(null);

  // Poll state
  const [poll, setPoll] = useState<Poll | null>(null);
  const [voteCounts, setVoteCounts] = useState<VoteCount[]>([]);
  const [myVoteOptionId, setMyVoteOptionId] = useState<string | null>(null);
  const [voting, setVoting] = useState(false);

  // Members for mention textarea
  const [members, setMembers] = useState<{ id: string; display_name: string }[]>([]);

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function fetchData() {
    // Get current user profile
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .single();
      if (profile) setProfileId(profile.id);
    }

    // Thread
    const { data: t } = await supabase
      .from("forum_threads")
      .select("*, author:profiles(display_name, avatar_url)")
      .eq("id", id)
      .single();
    setThread(t as Thread);

    // Replies
    const { data: r } = await supabase
      .from("forum_replies")
      .select("*, author:profiles(display_name, avatar_url)")
      .eq("thread_id", id)
      .order("created_at", { ascending: true });
    setReplies((r as Reply[]) ?? []);

    // Load group members for mention autocomplete
    if (t?.group_id) {
      const { data: memberships } = await supabase
        .from("group_memberships")
        .select("player:profiles(id, display_name)")
        .eq("group_id", t.group_id);
      if (memberships) {
        setMembers(memberships.map((m: any) => m.player).filter(Boolean));
      }
    }

    // Poll
    const { data: pollData } = await supabase
      .from("forum_polls")
      .select("id, question, anonymous")
      .eq("thread_id", id)
      .single();

    if (pollData) {
      const { data: options } = await supabase
        .from("forum_poll_options")
        .select("id, label, sort_order")
        .eq("poll_id", pollData.id)
        .order("sort_order");

      setPoll({
        ...pollData,
        options: (options as PollOption[]) ?? [],
      });

      await fetchVotes(pollData.id, pollData.anonymous);
    }

    setLoading(false);
  }

  async function fetchVotes(pollId: string, anonymous: boolean) {
    const { data: votes } = await supabase
      .from("forum_poll_votes")
      .select("option_id, voter_id, voter:profiles(display_name)")
      .eq("poll_id", pollId);

    if (!votes) return;

    // Check if current user voted
    const {
      data: { user },
    } = await supabase.auth.getUser();
    let currentProfileId: string | null = null;
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .single();
      currentProfileId = profile?.id ?? null;
    }

    const myVote = votes.find((v: any) => v.voter_id === currentProfileId);
    setMyVoteOptionId(myVote?.option_id ?? null);

    // Build vote counts
    const countMap = new Map<string, { count: number; voters: string[] }>();
    for (const vote of votes as any[]) {
      const existing = countMap.get(vote.option_id) ?? {
        count: 0,
        voters: [],
      };
      existing.count++;
      if (!anonymous && vote.voter?.display_name) {
        existing.voters.push(vote.voter.display_name);
      }
      countMap.set(vote.option_id, existing);
    }

    setVoteCounts(
      Array.from(countMap.entries()).map(([option_id, data]) => ({
        option_id,
        ...data,
      }))
    );
  }

  async function handleVote(optionId: string) {
    if (!poll || voting) return;
    setVoting(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .single();
    if (!profile) return;

    // If already voted, remove vote first
    if (myVoteOptionId) {
      await supabase
        .from("forum_poll_votes")
        .delete()
        .eq("poll_id", poll.id)
        .eq("voter_id", profile.id);
    }

    // If clicking different option, cast new vote
    if (optionId !== myVoteOptionId) {
      await supabase.from("forum_poll_votes").insert({
        poll_id: poll.id,
        option_id: optionId,
        voter_id: profile.id,
      });
    }

    await fetchVotes(poll.id, poll.anonymous);
    setVoting(false);
  }

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
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
      // Notify thread author
      if (thread) {
        await fetch("/api/forum/reply-notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ threadId: id }),
        });
      }

      // Notify mentioned users
      const mentionedNames = parseMentions(replyBody);
      if (mentionedNames.length > 0 && thread) {
        await fetch("/api/forum/mention-notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            threadId: id,
            groupId: thread.group_id,
            mentionedNames,
          }),
        });
      }

      setReplyBody("");
      await fetchData();
    }

    setSubmitting(false);
  }

  if (loading)
    return (
      <div className="text-center py-12 text-surface-muted">Loading...</div>
    );
  if (!thread)
    return (
      <div className="text-center py-12 text-surface-muted">
        Thread not found.
      </div>
    );

  const totalVotes = voteCounts.reduce((sum, v) => sum + v.count, 0);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-surface-muted">
        <Link href={`/groups/${slug}/forum`} className="hover:text-dark-200">
          Forum
        </Link>
        <span>/</span>
      </div>

      {/* Thread */}
      <div className="card">
        <div className="flex items-center gap-2 mb-2">
          {thread.pinned && (
            <span className="badge-blue text-xs">Pinned</span>
          )}
          <h1 className="text-xl font-bold text-dark-100">{thread.title}</h1>
        </div>
        <div className="flex items-center gap-2 text-sm text-surface-muted mb-4">
          {thread.author?.avatar_url ? (
            <img
              src={thread.author.avatar_url}
              alt=""
              className="h-6 w-6 rounded-full"
            />
          ) : (
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-900/50 text-brand-300 text-xs">
              {thread.author?.display_name?.charAt(0).toUpperCase()}
            </div>
          )}
          <span>{thread.author?.display_name}</span>
          <span>&middot;</span>
          <span>
            {new Date(thread.created_at).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
        </div>
        <div className="prose prose-sm max-w-none text-dark-200 whitespace-pre-wrap">
          <RenderMentions text={thread.body} />
        </div>

        {/* Poll */}
        {poll && (
          <div className="mt-4 rounded-lg border border-surface-border p-4 space-y-3">
            <h3 className="text-sm font-semibold text-dark-100">
              {poll.question}
            </h3>
            {poll.anonymous && (
              <p className="text-xs text-surface-muted">Votes are anonymous</p>
            )}
            <div className="space-y-2">
              {poll.options.map((option) => {
                const vc = voteCounts.find(
                  (v) => v.option_id === option.id
                );
                const count = vc?.count ?? 0;
                const pct = totalVotes > 0 ? (count / totalVotes) * 100 : 0;
                const isMyVote = myVoteOptionId === option.id;

                return (
                  <div key={option.id}>
                    <button
                      type="button"
                      onClick={() => handleVote(option.id)}
                      disabled={voting}
                      className={`w-full relative text-left rounded-md border px-3 py-2 text-sm transition-colors ${
                        isMyVote
                          ? "border-brand-500 bg-brand-900/20 text-brand-300"
                          : "border-surface-border text-dark-200 hover:border-brand-500/50"
                      }`}
                    >
                      <div
                        className="absolute inset-0 rounded-md bg-brand-500/10"
                        style={{ width: `${pct}%` }}
                      />
                      <div className="relative flex items-center justify-between">
                        <span>{option.label}</span>
                        <span className="text-xs text-surface-muted ml-2">
                          {count} {count === 1 ? "vote" : "votes"} ({Math.round(pct)}%)
                        </span>
                      </div>
                    </button>
                    {/* Show voters if not anonymous */}
                    {!poll.anonymous && vc && vc.voters.length > 0 && (
                      <p className="mt-0.5 ml-3 text-xs text-surface-muted">
                        {vc.voters.join(", ")}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-surface-muted">
              {totalVotes} total {totalVotes === 1 ? "vote" : "votes"}
              {myVoteOptionId && " · Click your vote to remove it"}
            </p>
          </div>
        )}
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
                <img
                  src={reply.author.avatar_url}
                  alt=""
                  className="h-5 w-5 rounded-full"
                />
              ) : (
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-overlay text-surface-muted text-xs">
                  {reply.author?.display_name?.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="font-medium text-dark-200">
                {reply.author?.display_name}
              </span>
              <span>&middot;</span>
              <span>
                {new Date(reply.created_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
            </div>
            <div className="text-sm text-dark-200 whitespace-pre-wrap">
              <RenderMentions text={reply.body} />
            </div>
          </div>
        ))}
      </div>

      {/* Reply Form */}
      <form onSubmit={handleReply} className="card space-y-3">
        <MentionTextarea
          value={replyBody}
          onChange={setReplyBody}
          members={members}
          maxLength={2000}
          minHeight="100px"
          placeholder="Write a reply... Use @ to mention someone"
        />
        <button
          type="submit"
          className="btn-primary"
          disabled={submitting || !replyBody.trim()}
        >
          {submitting ? "Posting..." : "Post Reply"}
        </button>
      </form>
    </div>
  );
}

// ============================================================
// Mention rendering
// ============================================================

/** Renders @mentions as highlighted spans */
function RenderMentions({ text }: { text: string }) {
  const parts = text.split(/(@[A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+)+)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.match(/^@[A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+)+$/)) {
          return (
            <span
              key={i}
              className="text-brand-400 font-medium"
            >
              {part}
            </span>
          );
        }
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}

/** Extract @mentions from text */
function parseMentions(text: string): string[] {
  const regex = /@([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+)+)/g;
  const names: string[] = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    names.push(match[1]);
  }
  return [...new Set(names)];
}

// ============================================================
// Mention Textarea with autocomplete
// ============================================================

function MentionTextarea({
  value,
  onChange,
  members,
  maxLength,
  minHeight,
  placeholder,
}: {
  value: string;
  onChange: (val: string) => void;
  members: { id: string; display_name: string }[];
  maxLength: number;
  minHeight: string;
  placeholder?: string;
}) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<typeof members>([]);
  const [mentionStart, setMentionStart] = useState(-1);
  const [cursorPos, setCursorPos] = useState(0);

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const newValue = e.target.value;
    onChange(newValue);

    const pos = e.target.selectionStart;
    setCursorPos(pos);
    const textBeforeCursor = newValue.slice(0, pos);
    const atIndex = textBeforeCursor.lastIndexOf("@");

    if (atIndex >= 0) {
      const charBefore = atIndex > 0 ? textBeforeCursor[atIndex - 1] : " ";
      if (charBefore === " " || charBefore === "\n" || atIndex === 0) {
        const query = textBeforeCursor.slice(atIndex + 1).toLowerCase();
        if (!query.includes("\n")) {
          const filtered = members.filter((m) =>
            m.display_name.toLowerCase().includes(query)
          );
          setSuggestions(filtered.slice(0, 5));
          setShowSuggestions(filtered.length > 0);
          setMentionStart(atIndex);
          return;
        }
      }
    }

    setShowSuggestions(false);
  }

  function selectMember(member: { id: string; display_name: string }) {
    const before = value.slice(0, mentionStart);
    const after = value.slice(cursorPos);
    const newValue = `${before}@${member.display_name}${after.startsWith(" ") || after.startsWith("\n") || after === "" ? "" : " "}${after}`;
    onChange(newValue);
    setShowSuggestions(false);
  }

  return (
    <div className="relative">
      <textarea
        value={value}
        onChange={handleChange}
        className="input"
        style={{ minHeight }}
        maxLength={maxLength}
        placeholder={placeholder}
        required
      />
      {showSuggestions && (
        <div className="absolute z-20 mt-1 w-64 rounded-lg border border-surface-border bg-surface-raised shadow-lg overflow-hidden">
          {suggestions.map((member) => (
            <button
              key={member.id}
              type="button"
              onClick={() => selectMember(member)}
              className="block w-full px-3 py-2 text-left text-sm text-dark-200 hover:bg-surface-overlay"
            >
              @{member.display_name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
