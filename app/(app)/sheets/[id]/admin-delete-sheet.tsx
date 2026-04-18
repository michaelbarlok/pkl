"use client";

import { FormError } from "@/components/form-error";
import { useRouter } from "next/navigation";
import { useState } from "react";

const REASONS = [
  { value: "lack_of_interest", label: "Lack of Player Interest" },
  { value: "inclement_weather", label: "Inclement Weather" },
  { value: "other", label: "Other" },
] as const;

export function AdminDeleteSheet({ sheetId }: { sheetId: string }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [reason, setReason] = useState<string>("");
  const [message, setMessage] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason) return;

    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/sheets/${sheetId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, message: message.trim() || undefined }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to cancel sheet.");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel.");
      setDeleting(false);
    }
  }

  if (!showForm) {
    return (
      <button
        onClick={() => setShowForm(true)}
        className="btn-danger w-full sm:w-auto"
      >
        Cancel Event
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-red-900/40 bg-red-950/20 p-4 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-red-400">Cancel this event?</h3>
        <p className="text-xs text-surface-muted mt-0.5">
          All registrants will be notified with the reason below.
        </p>
      </div>

      <div>
        <label className="block text-xs font-medium text-dark-200 mb-1.5">
          Reason <span className="text-red-400">*</span>
        </label>
        <select
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="input w-full"
          required
        >
          <option value="">— Select a reason —</option>
          {REASONS.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-dark-200 mb-1.5">
          Message to players <span className="text-surface-muted font-normal">(optional)</span>
        </label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          maxLength={500}
          className="input w-full resize-none"
          placeholder="e.g. Courts are flooded. We'll reschedule for next week."
        />
        <p className="text-[11px] text-surface-muted mt-1 text-right">{message.length}/500</p>
      </div>

      <FormError message={error} />

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={deleting || !reason}
          className="btn-danger disabled:opacity-50"
        >
          {deleting ? "Cancelling..." : "Confirm Cancellation"}
        </button>
        <button
          type="button"
          onClick={() => { setShowForm(false); setReason(""); setMessage(""); setError(null); }}
          className="btn-secondary"
        >
          Back
        </button>
      </div>
    </form>
  );
}
