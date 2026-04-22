"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  groupId: string;
  memberCount: number;
}

/**
 * Send Announcement card for group admins. Posts to the broadcast API,
 * which now persists a `group_announcements` row and fans out
 * notifications that deep-link to the announcement detail page.
 */
export function SendAnnouncement({ groupId, memberCount }: Props) {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-grow the textarea so admins can see the full draft as they
  // type (including blank lines between paragraphs) instead of
  // scrolling inside a 4-row window. Clamp with a CSS max-height so a
  // runaway message doesn't push the submit button off screen.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [message]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setResult(null);
    const res = await fetch(`/api/groups/${groupId}/broadcast`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, message }),
    });
    const data = await res.json();
    if (res.ok) {
      setResult({
        type: "success",
        text: `Sent to ${data.sent} member${data.sent !== 1 ? "s" : ""}.`,
      });
      setTitle("");
      setMessage("");
    } else {
      setResult({ type: "error", text: data.error ?? "Failed to send." });
    }
    setSending(false);
  }

  return (
    <form onSubmit={submit} className="card space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-dark-100">Send Announcement</h3>
        <p className="text-xs text-surface-muted mt-0.5">
          Sends a push notification and email to all {memberCount} group member
          {memberCount !== 1 ? "s" : ""}. Press Enter for a new line.
        </p>
      </div>
      <div>
        <label className="block text-xs font-medium text-dark-200 mb-1.5">
          Subject / Title <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={100}
          required
          className="input w-full"
          placeholder="e.g. Court change for Wednesday"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-dark-200 mb-1.5">
          Message <span className="text-red-400">*</span>
        </label>
        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={2000}
          required
          rows={4}
          className="input w-full resize-y min-h-[6rem] max-h-[60vh] overflow-y-auto"
          placeholder="Write your message to all group members..."
        />
        <p className="text-[11px] text-surface-muted mt-1 text-right">
          {message.length}/2000
        </p>
      </div>
      {result && (
        <p
          className={`text-sm font-medium ${
            result.type === "success" ? "text-teal-400" : "text-red-400"
          }`}
        >
          {result.text}
        </p>
      )}
      <button
        type="submit"
        disabled={sending || !title.trim() || !message.trim()}
        className="btn-primary disabled:opacity-50"
      >
        {sending ? "Sending..." : "Send to All Members"}
      </button>
    </form>
  );
}
