"use client";

import { useSupabase } from "@/components/providers/supabase-provider";
import { MentionTextarea } from "@/components/mention-textarea";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface PollOption {
  label: string;
}

export default function NewThreadPage() {
  const { slug } = useParams<{ slug: string }>();
  const { supabase } = useSupabase();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [groupId, setGroupId] = useState<string | null>(null);

  // Poll state
  const [includePoll, setIncludePoll] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState<PollOption[]>([
    { label: "" },
    { label: "" },
  ]);
  const [pollAnonymous, setPollAnonymous] = useState(false);

  // Members for @mention suggestions
  const [members, setMembers] = useState<{ id: string; display_name: string }[]>([]);

  useEffect(() => {
    async function load() {
      const { data: group } = await supabase
        .from("shootout_groups")
        .select("id")
        .eq("slug", slug)
        .single();
      if (group) {
        setGroupId(group.id);
        // Load group members for mention autocomplete
        const { data: memberships } = await supabase
          .from("group_memberships")
          .select("player:profiles(id, display_name)")
          .eq("group_id", group.id);
        if (memberships) {
          setMembers(
            memberships
              .map((m: any) => m.player)
              .filter(Boolean)
          );
        }
      }
    }
    load();
  }, [slug, supabase]);

  function addPollOption() {
    if (pollOptions.length < 10) {
      setPollOptions([...pollOptions, { label: "" }]);
    }
  }

  function removePollOption(index: number) {
    if (pollOptions.length > 2) {
      setPollOptions(pollOptions.filter((_, i) => i !== index));
    }
  }

  function updatePollOption(index: number, label: string) {
    const updated = [...pollOptions];
    updated[index] = { label };
    setPollOptions(updated);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    if (!groupId) {
      setError("Group not found");
      setSubmitting(false);
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("You must be signed in");
      setSubmitting(false);
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!profile) {
      setError("Profile not found");
      setSubmitting(false);
      return;
    }

    // Validate poll if included
    if (includePoll) {
      if (!pollQuestion.trim()) {
        setError("Poll question is required");
        setSubmitting(false);
        return;
      }
      const validOptions = pollOptions.filter((o) => o.label.trim());
      if (validOptions.length < 2) {
        setError("At least 2 poll options are required");
        setSubmitting(false);
        return;
      }
    }

    const { data: thread, error: insertError } = await supabase
      .from("forum_threads")
      .insert({
        author_id: profile.id,
        group_id: groupId,
        title,
        body,
      })
      .select()
      .single();

    if (insertError) {
      setError(insertError.message);
      setSubmitting(false);
      return;
    }

    // Create poll if included
    if (includePoll) {
      const { data: poll, error: pollError } = await supabase
        .from("forum_polls")
        .insert({
          thread_id: thread.id,
          question: pollQuestion.trim(),
          anonymous: pollAnonymous,
        })
        .select()
        .single();

      if (pollError) {
        setError(pollError.message);
        setSubmitting(false);
        return;
      }

      const validOptions = pollOptions
        .filter((o) => o.label.trim())
        .map((o, i) => ({
          poll_id: poll.id,
          label: o.label.trim(),
          sort_order: i,
        }));

      const { error: optionsError } = await supabase
        .from("forum_poll_options")
        .insert(validOptions);

      if (optionsError) {
        setError(optionsError.message);
        setSubmitting(false);
        return;
      }
    }

    // Notify mentioned users
    const mentionedNames = parseMentions(body);
    if (mentionedNames.length > 0) {
      await fetch("/api/forum/mention-notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: thread.id,
          groupId,
          mentionedNames,
        }),
      });
    }

    router.push(`/groups/${slug}/forum/${thread.id}`);
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-dark-100">New Thread</h1>

      <form onSubmit={handleSubmit} className="card space-y-4">
        <div>
          <label
            htmlFor="title"
            className="block text-sm font-medium text-dark-200 mb-1"
          >
            Title
          </label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="input"
            maxLength={120}
            required
          />
          <p className="mt-1 text-xs text-surface-muted">{title.length}/120</p>
        </div>

        <div>
          <label
            htmlFor="body"
            className="block text-sm font-medium text-dark-200 mb-1"
          >
            Body
          </label>
          <p className="text-xs text-surface-muted mb-1">
            Use @Full Name to tag members (e.g. @Michael Barlok)
          </p>
          <MentionTextarea
            value={body}
            onChange={setBody}
            members={members}
            maxLength={5000}
            minHeight="200px"
            placeholder="Write your post..."
          />
          <p className="mt-1 text-xs text-surface-muted">{body.length}/5000</p>
        </div>

        {/* Poll Toggle */}
        <div className="border-t border-surface-border pt-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={includePoll}
              onChange={(e) => setIncludePoll(e.target.checked)}
              className="rounded border-surface-border text-brand-500 focus:ring-brand-500"
            />
            <span className="text-sm font-medium text-dark-200">
              Include a poll
            </span>
          </label>
        </div>

        {/* Poll Builder */}
        {includePoll && (
          <div className="space-y-3 rounded-lg border border-surface-border p-4">
            <div>
              <label className="block text-sm font-medium text-dark-200 mb-1">
                Poll Question
              </label>
              <input
                type="text"
                value={pollQuestion}
                onChange={(e) => setPollQuestion(e.target.value)}
                className="input"
                maxLength={500}
                placeholder="What do you want to ask?"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-dark-200 mb-2">
                Options
              </label>
              <div className="space-y-2">
                {pollOptions.map((option, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={option.label}
                      onChange={(e) => updatePollOption(i, e.target.value)}
                      className="input flex-1"
                      maxLength={200}
                      placeholder={`Option ${i + 1}`}
                    />
                    {pollOptions.length > 2 && (
                      <button
                        type="button"
                        onClick={() => removePollOption(i)}
                        className="text-red-400 hover:text-red-300 text-sm px-2"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {pollOptions.length < 10 && (
                <button
                  type="button"
                  onClick={addPollOption}
                  className="mt-2 text-sm text-brand-400 hover:text-brand-300"
                >
                  + Add option
                </button>
              )}
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={pollAnonymous}
                onChange={(e) => setPollAnonymous(e.target.checked)}
                className="rounded border-surface-border text-brand-500 focus:ring-brand-500"
              />
              <span className="text-sm text-dark-200">
                Anonymous votes (hide who voted for what)
              </span>
            </label>
          </div>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex gap-3">
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? "Posting..." : "Post Thread"}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="btn-secondary"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

// ============================================================
// @mention helpers
// ============================================================

/** Extract @mentions from text. Matches @First Last pattern. */
function parseMentions(text: string): string[] {
  const regex = /@([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+)+)/g;
  const names: string[] = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    names.push(match[1]);
  }
  return [...new Set(names)];
}

