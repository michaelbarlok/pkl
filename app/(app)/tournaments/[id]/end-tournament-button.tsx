"use client";

import { useConfirm } from "@/components/confirm-modal";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * "End Tournament" is stricter than the old "Mark Complete" server
 * action: it refuses the transition unless every non-BYE match is
 * scored, deactivates every division, and triggers the recap
 * notification fan-out.
 */
export function EndTournamentButton({ tournamentId }: { tournamentId: string }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function end() {
    if (busy) return;
    const ok = await confirm({
      title: "End the tournament?",
      description:
        "Final standings lock and recap notifications go out to every player and organizer. This can't be undone.",
      confirmLabel: "End tournament",
      cancelLabel: "Cancel",
      variant: "warning",
    });
    if (!ok) return;
    setBusy(true);
    setError("");
    const res = await fetch(`/api/tournaments/${tournamentId}/complete`, {
      method: "POST",
    });
    setBusy(false);
    if (res.ok) {
      router.refresh();
      return;
    }
    const data = await res.json().catch(() => ({}));
    setError(data.error ?? "Could not end the tournament.");
  }

  return (
    <div>
      <button
        type="button"
        onClick={end}
        disabled={busy}
        className="btn-primary disabled:opacity-50"
      >
        {busy ? "Ending…" : "End Tournament"}
      </button>
      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
    </div>
  );
}
