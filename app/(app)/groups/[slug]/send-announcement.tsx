"use client";

import { useEffect, useRef, useState } from "react";
import { useSupabase } from "@/components/providers/supabase-provider";

interface Props {
  groupId: string;
  memberCount: number;
}

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // mirrors the bucket cap
const ACCEPTED_ATTACHMENT_TYPES = "image/*,application/pdf";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

interface UploadedAttachment {
  url: string;
  name: string;
  type: string;
  storagePath: string;
}

/**
 * Send Announcement card for group admins. Posts to the broadcast API,
 * which persists a `group_announcements` row and fans out
 * notifications that deep-link to the announcement detail page.
 *
 * Attachments: a single optional photo or PDF per announcement. Files
 * are uploaded to the `announcement-attachments` storage bucket as
 * soon as the admin picks one (so we don't eat the POST body on send),
 * and the public URL is passed along to the broadcast API. If the
 * admin removes the file or closes the composer without sending, we
 * delete the stray object to keep the bucket tidy.
 */
export function SendAnnouncement({ groupId, memberCount }: Props) {
  const { supabase } = useSupabase();
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [attachment, setAttachment] = useState<UploadedAttachment | null>(null);
  const [uploading, setUploading] = useState(false);
  const [attachError, setAttachError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [message]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAttachError("");

    if (file.size > MAX_ATTACHMENT_BYTES) {
      setAttachError(`File too large — max ${formatBytes(MAX_ATTACHMENT_BYTES)}.`);
      e.target.value = "";
      return;
    }

    // Discard the previous upload if the admin picks a replacement —
    // otherwise the bucket collects orphans.
    if (attachment) {
      await supabase.storage
        .from("announcement-attachments")
        .remove([attachment.storagePath]);
    }

    setUploading(true);
    const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
    const storagePath = `${groupId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("announcement-attachments")
      .upload(storagePath, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadError) {
      setAttachError(uploadError.message || "Upload failed. Please try again.");
      setUploading(false);
      e.target.value = "";
      return;
    }

    const { data: urlData } = supabase.storage
      .from("announcement-attachments")
      .getPublicUrl(storagePath);

    setAttachment({
      url: urlData.publicUrl,
      name: file.name,
      type: file.type || "application/octet-stream",
      storagePath,
    });
    setUploading(false);
  }

  async function clearAttachment() {
    if (!attachment) return;
    // Best-effort cleanup — if it fails the object just lingers, which
    // is preferable to blocking the admin from removing it from the UI.
    await supabase.storage
      .from("announcement-attachments")
      .remove([attachment.storagePath]);
    setAttachment(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setResult(null);
    const res = await fetch(`/api/groups/${groupId}/broadcast`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        message,
        attachment: attachment
          ? {
              url: attachment.url,
              name: attachment.name,
              type: attachment.type,
            }
          : undefined,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      setResult({
        type: "success",
        text: `Sent to ${data.sent} member${data.sent !== 1 ? "s" : ""}.`,
      });
      setTitle("");
      setMessage("");
      setAttachment(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } else {
      setResult({ type: "error", text: data.error ?? "Failed to send." });
    }
    setSending(false);
  }

  const isImage = attachment?.type.startsWith("image/");

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

      <div>
        <label className="block text-xs font-medium text-dark-200 mb-1.5">
          Attachment{" "}
          <span className="text-surface-muted font-normal">
            (optional — photo or PDF, max {formatBytes(MAX_ATTACHMENT_BYTES)})
          </span>
        </label>
        {attachment ? (
          <div className="flex items-center gap-3 rounded-md bg-surface-overlay p-2">
            {isImage ? (
              <img
                src={attachment.url}
                alt=""
                className="h-12 w-12 rounded object-cover"
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded bg-surface-raised text-surface-muted">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                </svg>
              </div>
            )}
            <div className="flex-1 min-w-0 text-xs">
              <p className="truncate text-dark-200">{attachment.name}</p>
              <p className="text-surface-muted">{isImage ? "Image" : "PDF"}</p>
            </div>
            <button
              type="button"
              onClick={clearAttachment}
              className="text-surface-muted hover:text-red-300"
              aria-label="Remove attachment"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="btn-secondary w-full text-xs disabled:opacity-50"
          >
            {uploading ? "Uploading…" : "Add a photo or PDF"}
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_ATTACHMENT_TYPES}
          onChange={handleFileChange}
          className="hidden"
        />
        {attachError && <p className="mt-1 text-xs text-red-400">{attachError}</p>}
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
        disabled={sending || uploading || !title.trim() || !message.trim()}
        className="btn-primary disabled:opacity-50"
      >
        {sending ? "Sending..." : "Send to All Members"}
      </button>
    </form>
  );
}
