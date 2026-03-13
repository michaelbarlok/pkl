"use client";

import { useSupabase } from "@/components/providers/supabase-provider";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function NewThreadPage() {
  const { supabase } = useSupabase();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    const { data: { user } } = await supabase.auth.getUser();
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

    const { data: thread, error: insertError } = await supabase
      .from("forum_threads")
      .insert({
        author_id: profile.id,
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

    router.push(`/forum/${thread.id}`);
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-dark-100">New Thread</h1>

      <form onSubmit={handleSubmit} className="card space-y-4">
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-dark-200 mb-1">
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
          <label htmlFor="body" className="block text-sm font-medium text-dark-200 mb-1">
            Body
          </label>
          <textarea
            id="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="input min-h-[200px]"
            maxLength={5000}
            required
          />
          <p className="mt-1 text-xs text-surface-muted">{body.length}/5000</p>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex gap-3">
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? "Posting..." : "Post Thread"}
          </button>
          <button type="button" onClick={() => router.back()} className="btn-secondary">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
