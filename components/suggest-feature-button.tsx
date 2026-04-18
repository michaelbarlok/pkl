"use client";

import { useState } from "react";

export function SuggestFeatureButton({
  collapsed = false,
  onDone,
}: {
  collapsed?: boolean;
  onDone?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  function openModal() {
    setOpen(true);
    setSuccess(false);
    setError("");
    setTitle("");
    setDescription("");
  }

  function closeModal() {
    setOpen(false);
    onDone?.();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    const res = await fetch("/api/feature-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, description }),
    });

    setSubmitting(false);

    if (res.ok) {
      setSuccess(true);
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong. Please try again.");
    }
  }

  return (
    <>
      <button
        onClick={openModal}
        title={collapsed ? "Suggest a Feature" : undefined}
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
            d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18"
          />
        </svg>
        {!collapsed && "Suggest a Feature"}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60"
            onClick={closeModal}
          />

          {/* Modal */}
          <div className="relative w-full max-w-md rounded-xl bg-surface-raised border border-surface-border shadow-2xl p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-base font-semibold text-dark-100">Suggest a Feature</h2>
                <p className="text-xs text-surface-muted mt-0.5">
                  We read every submission. Your ideas help shape the app.
                </p>
              </div>
              <button
                onClick={closeModal}
                className="ml-4 text-surface-muted hover:text-dark-100 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {success ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-teal-500/30 bg-teal-900/20 px-4 py-3 text-sm text-teal-300">
                  Thanks! Your suggestion has been sent. We appreciate the feedback.
                </div>
                <button onClick={closeModal} className="btn-primary w-full">
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-dark-200 mb-1">
                    Title <span className="text-surface-muted font-normal">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={120}
                    placeholder="e.g. Show head-to-head records on profiles"
                    className="input w-full"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-dark-200 mb-1">
                    Description <span className="text-red-400">*</span>
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    maxLength={2000}
                    rows={5}
                    required
                    placeholder="Describe the feature or improvement you'd like to see..."
                    className="input w-full resize-none"
                  />
                  <p className="text-right text-xs text-surface-muted mt-1">
                    {description.length}/2000
                  </p>
                </div>

                {error && (
                  <p className="text-sm text-red-400">{error}</p>
                )}

                <div className="flex gap-3">
                  <button
                    type="submit"
                    disabled={submitting || !description.trim()}
                    className="btn-primary flex-1"
                  >
                    {submitting ? "Sending…" : "Submit"}
                  </button>
                  <button
                    type="button"
                    onClick={closeModal}
                    className="btn-secondary"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
