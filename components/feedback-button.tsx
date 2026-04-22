"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type FeedbackKind = "feature" | "bug";

// Keep attachments well under the default 4MB Next.js API body limit.
// We base64-encode the file which adds ~33% overhead, so a 3MB raw
// cap lands around 4MB post-encode once wrapped in JSON.
const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;
const ACCEPTED_ATTACHMENT_TYPES = "image/*,application/pdf";

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Feedback button used in the desktop sidebar + mobile "More" menu.
 * Submits either a feature suggestion or a bug report depending on
 * the type picker in the modal.
 *
 * Modal rendering: the dialog is portaled to `document.body` rather
 * than living inside the button's DOM. That matters mostly on mobile,
 * where the button sits INSIDE the More drawer. Without a portal the
 * modal inherited the drawer's stacking context, so:
 *   - collapsing the drawer via the hamburger left the modal mounted
 *     but invisible — it "reappeared" next time the drawer opened,
 *   - z-index collisions between the drawer (z-50) and modal (z-50)
 *     made the modal sometimes render behind the drawer.
 *
 * Opening the modal also explicitly closes the parent drawer via
 * `onDone()` so there's only ever one full-screen layer in play, and
 * the panel is scrollable so the submit button is reachable on short
 * viewports (especially with the soft keyboard up).
 */
export function FeedbackButton({
  collapsed = false,
  onDone,
}: {
  collapsed?: boolean;
  onDone?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<FeedbackKind>("feature");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  // Portals need document, so gate the portal behind mount to avoid
  // SSR/hydration mismatches.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const descriptionRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Auto-grow the description so a long bug write-up doesn't force
  // the author to scroll inside a 5-row window.
  useEffect(() => {
    const el = descriptionRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [description, open]);

  function openModal() {
    setOpen(true);
    setSuccess(false);
    setError("");
    setTitle("");
    setDescription("");
    setAttachment(null);
    setKind("feature");
    if (fileInputRef.current) fileInputRef.current.value = "";
    // Collapse the parent (mobile More drawer) so the modal is the
    // only visible layer. Without this, tapping the hamburger again
    // while the modal is open would leave it orphaned on screen.
    onDone?.();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      setAttachment(null);
      return;
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setError(`Attachment too large — max ${formatBytes(MAX_ATTACHMENT_BYTES)}.`);
      e.target.value = "";
      setAttachment(null);
      return;
    }
    setError("");
    setAttachment(file);
  }

  function clearAttachment() {
    setAttachment(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function closeModal() {
    setOpen(false);
  }

  // Escape closes the modal.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Prevent body scroll while the modal is up (doesn't conflict with
  // the panel's own overflow-y-auto).
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    // Base64-encode the attachment (if any) so we can pass it as JSON
    // and the API can hand it straight to Resend without hitting the
    // filesystem.
    let attachmentPayload: { name: string; type: string; data: string } | undefined;
    if (attachment) {
      try {
        const data = await fileToBase64(attachment);
        attachmentPayload = {
          name: attachment.name,
          type: attachment.type || "application/octet-stream",
          data,
        };
      } catch {
        setError("Couldn't read the attachment. Please try a different file.");
        setSubmitting(false);
        return;
      }
    }

    const res = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, title, description, attachment: attachmentPayload }),
    });

    setSubmitting(false);

    if (res.ok) {
      setSuccess(true);
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong. Please try again.");
    }
  }

  const isBug = kind === "bug";
  const modalTitle = "Send feedback";
  const modalSub = "Suggest a feature or report a bug — every submission lands in our inbox.";
  const titlePlaceholder = isBug
    ? "e.g. Scoreboard freezes when I submit round 3"
    : "e.g. Show head-to-head records on profiles";
  const descriptionPlaceholder = isBug
    ? "What were you doing? What did you expect to happen? What happened instead?"
    : "Describe the feature or improvement you'd like to see…";
  const successCopy = isBug
    ? "Thanks! Your bug report has been sent — we'll take a look."
    : "Thanks! Your suggestion has been sent. We appreciate the feedback.";

  const modal = open && (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center sm:items-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="feedback-modal-title"
    >
      <div className="absolute inset-0 bg-black/60" onClick={closeModal} />

      {/* Panel scrolls internally so the Submit button is always
           reachable — important on short mobile viewports with the
           keyboard up. */}
      <div
        className="relative w-full sm:max-w-md rounded-t-xl sm:rounded-xl bg-surface-raised border border-surface-border shadow-2xl p-6 space-y-4 max-h-[calc(100dvh-2rem)] overflow-y-auto"
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 id="feedback-modal-title" className="text-base font-semibold text-dark-100">
              {modalTitle}
            </h2>
            <p className="text-xs text-surface-muted mt-0.5">{modalSub}</p>
          </div>
          <button
            onClick={closeModal}
            className="ml-4 text-surface-muted hover:text-dark-100 transition-colors"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {success ? (
          <div className="space-y-4">
            <div className="alert-success px-4 py-3 text-sm">{successCopy}</div>
            <button onClick={closeModal} className="btn-primary w-full">
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-dark-200 mb-1.5">
                Type <span className="text-red-400">*</span>
              </label>
              <div
                role="radiogroup"
                className="inline-flex rounded-lg bg-surface-overlay p-0.5"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={kind === "feature"}
                  onClick={() => setKind("feature")}
                  className={
                    "px-3 py-1.5 text-xs font-medium rounded-md transition-colors " +
                    (kind === "feature"
                      ? "bg-brand-500/20 text-brand-300 ring-1 ring-brand-500/40"
                      : "text-dark-200 hover:text-dark-100")
                  }
                >
                  💡 Feature request
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={kind === "bug"}
                  onClick={() => setKind("bug")}
                  className={
                    "px-3 py-1.5 text-xs font-medium rounded-md transition-colors " +
                    (kind === "bug"
                      ? "bg-red-500/15 text-red-300 ring-1 ring-red-500/40"
                      : "text-dark-200 hover:text-dark-100")
                  }
                >
                  🐞 Bug report
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-dark-200 mb-1">
                Title <span className="text-surface-muted font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
                placeholder={titlePlaceholder}
                className="input w-full"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-dark-200 mb-1">
                {isBug ? "What happened?" : "Description"}{" "}
                <span className="text-red-400">*</span>
              </label>
              <textarea
                ref={descriptionRef}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={2000}
                rows={5}
                required
                placeholder={descriptionPlaceholder}
                className="input w-full resize-y min-h-[7rem] max-h-[50vh] overflow-y-auto"
              />
              <p className="text-right text-xs text-surface-muted mt-1">
                {description.length}/2000
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-dark-200 mb-1">
                Attachment{" "}
                <span className="text-surface-muted font-normal">
                  (optional — photo or PDF, max {formatBytes(MAX_ATTACHMENT_BYTES)})
                </span>
              </label>
              {attachment ? (
                <div className="flex items-center gap-2 rounded-md bg-surface-overlay px-3 py-2 text-xs">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    className="h-4 w-4 shrink-0 text-surface-muted"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13"
                    />
                  </svg>
                  <span className="flex-1 truncate text-dark-200">{attachment.name}</span>
                  <span className="text-surface-muted">{formatBytes(attachment.size)}</span>
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
                  className="btn-secondary w-full text-xs"
                >
                  Add a file
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_ATTACHMENT_TYPES}
                onChange={handleFileChange}
                className="hidden"
              />
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}

            {/* sticky action bar so the Submit button stays visible
                 even if the panel itself has to scroll. */}
            <div className="sticky bottom-0 -mx-6 -mb-6 bg-surface-raised px-6 py-4 border-t border-surface-border flex gap-3">
              <button
                type="submit"
                disabled={submitting || !description.trim()}
                className="btn-primary flex-1"
              >
                {submitting ? "Sending…" : isBug ? "Send report" : "Submit"}
              </button>
              <button type="button" onClick={closeModal} className="btn-secondary">
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );

  return (
    <>
      <button
        onClick={openModal}
        title={collapsed ? "Send feedback" : undefined}
        className={
          collapsed
            ? "flex w-full items-center justify-center rounded-md py-1.5 text-surface-muted hover:bg-surface-overlay hover:text-dark-100 transition-colors"
            : "flex w-full items-center gap-3 px-4 py-2.5 text-sm font-medium text-dark-200 hover:bg-surface-overlay active:bg-surface-overlay"
        }
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className={collapsed ? "h-5 w-5" : "h-5 w-5 shrink-0"}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.068.157 2.148.279 3.238.364.466.037.893.281 1.153.671L12 21l2.652-3.978c.26-.39.687-.634 1.153-.67 1.09-.086 2.17-.208 3.238-.365 1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z"
          />
        </svg>
        {!collapsed && "Send feedback"}
      </button>

      {mounted && modal ? createPortal(modal, document.body) : null}
    </>
  );
}
