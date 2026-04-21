"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type FeedbackKind = "feature" | "bug";

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
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  // Portals need document, so gate the portal behind mount to avoid
  // SSR/hydration mismatches.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  function openModal() {
    setOpen(true);
    setSuccess(false);
    setError("");
    setTitle("");
    setDescription("");
    setKind("feature");
    // Collapse the parent (mobile More drawer) so the modal is the
    // only visible layer. Without this, tapping the hamburger again
    // while the modal is open would leave it orphaned on screen.
    onDone?.();
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

    const res = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, title, description }),
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
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={2000}
                rows={5}
                required
                placeholder={descriptionPlaceholder}
                className="input w-full resize-none"
              />
              <p className="text-right text-xs text-surface-muted mt-1">
                {description.length}/2000
              </p>
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
