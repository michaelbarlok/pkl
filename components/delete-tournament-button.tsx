"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useConfirm } from "@/components/confirm-modal";

export function DeleteTournamentButton({ tournamentId }: { tournamentId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    const res = await fetch(`/api/tournaments/${tournamentId}`, { method: "DELETE" });

    if (res.ok) {
      router.push("/tournaments");
      router.refresh();
    } else {
      const data = await res.json().catch(() => null);
      alert(data?.error ?? "Failed to delete tournament");
      setDeleting(false);
      setConfirming(false);
    }
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="btn-secondary !border-red-500/50 !text-red-400 hover:!bg-red-900/20"
      >
        Delete Tournament
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-red-400">Delete this tournament and all its data?</span>
      <button
        type="button"
        onClick={handleDelete}
        disabled={deleting}
        className="btn-secondary !border-red-500/50 !text-red-400 hover:!bg-red-900/20 disabled:opacity-50"
      >
        {deleting ? "Deleting…" : "Confirm Delete"}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="btn-secondary text-xs"
      >
        Cancel
      </button>
    </div>
  );
}

/**
 * Compact inline delete for admin tables.
 */
export function AdminDeleteButton({ tournamentId }: { tournamentId: string }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, setPending] = useState(false);

  async function handleDelete() {
    const ok = await confirm({
      title: "Delete tournament?",
      description: "All match data and registrations will be permanently deleted. This cannot be undone.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    setPending(true);
    const res = await fetch(`/api/tournaments/${tournamentId}`, { method: "DELETE" });
    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json().catch(() => null);
      alert(data?.error ?? "Failed to delete");
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={pending}
      className="text-red-400 hover:text-red-300 disabled:opacity-50"
    >
      {pending ? "…" : "Delete"}
    </button>
  );
}
