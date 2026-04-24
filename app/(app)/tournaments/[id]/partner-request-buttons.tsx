"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Inline "Ask to Partner?" button rendered next to a need-partner
 * entry on the registered list. Viewer must be logged in, not
 * already partnered on this tournament, and looking at someone else.
 */
export function AskToPartnerButton({
  tournamentId,
  targetId,
  targetName,
}: {
  tournamentId: string;
  targetId: string;
  targetName: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function ask() {
    if (busy || sent) return;
    if (!confirm(`Send ${targetName} a partner request?`)) return;
    setBusy(true);
    setError("");
    const res = await fetch(
      `/api/tournaments/${tournamentId}/partner-requests`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_id: targetId }),
      }
    );
    setBusy(false);
    if (res.ok) {
      setSent(true);
      router.refresh();
      return;
    }
    const data = await res.json().catch(() => ({}));
    setError(data.error ?? "Could not send request");
  }

  if (sent) {
    return <span className="text-[11px] text-surface-muted">Request sent</span>;
  }
  return (
    <>
      <button
        type="button"
        onClick={ask}
        disabled={busy}
        className="text-[11px] text-brand-vivid hover:underline disabled:opacity-50"
      >
        {busy ? "Sending…" : "Ask to Partner?"}
      </button>
      {error && <span className="text-[11px] text-red-400 ml-1">{error}</span>}
    </>
  );
}

/**
 * Accept / Decline buttons rendered on the pending-requests card when
 * the viewer is the target of a partner request.
 */
export function RespondToRequestButtons({
  tournamentId,
  requestId,
}: {
  tournamentId: string;
  requestId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [error, setError] = useState("");

  async function respond(action: "accept" | "decline") {
    if (busy) return;
    setBusy(action);
    setError("");
    const res = await fetch(
      `/api/tournaments/${tournamentId}/partner-requests/${requestId}/respond`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      }
    );
    setBusy(null);
    if (res.ok) {
      router.refresh();
      return;
    }
    const data = await res.json().catch(() => ({}));
    setError(data.error ?? "Could not respond");
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => respond("accept")}
        disabled={busy !== null}
        className="btn-primary text-xs py-1 px-2.5 disabled:opacity-50"
      >
        {busy === "accept" ? "…" : "Confirm"}
      </button>
      <button
        type="button"
        onClick={() => respond("decline")}
        disabled={busy !== null}
        className="btn-secondary text-xs py-1 px-2.5 disabled:opacity-50"
      >
        {busy === "decline" ? "…" : "Decline"}
      </button>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}

/**
 * Small "Cancel" link the requester sees next to their outgoing
 * pending request. Lets them back out before the target responds
 * (previously there was no way to undo).
 */
export function CancelRequestButton({
  tournamentId,
  requestId,
}: {
  tournamentId: string;
  requestId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function cancel() {
    if (busy) return;
    if (!confirm("Cancel this partner request?")) return;
    setBusy(true);
    setError("");
    const res = await fetch(
      `/api/tournaments/${tournamentId}/partner-requests/${requestId}`,
      { method: "DELETE" }
    );
    setBusy(false);
    if (res.ok) {
      router.refresh();
      return;
    }
    const data = await res.json().catch(() => ({}));
    setError(data.error ?? "Could not cancel");
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-surface-muted">Waiting on reply</span>
      <button
        type="button"
        onClick={cancel}
        disabled={busy}
        className="text-xs text-surface-muted hover:text-dark-100 underline disabled:opacity-50"
      >
        {busy ? "…" : "Cancel"}
      </button>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}
