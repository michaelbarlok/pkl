"use client";

import { useConfirm } from "@/components/confirm-modal";
import { FormError } from "@/components/form-error";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function AdminDeleteSheet({ sheetId }: { sheetId: string }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    const ok = await confirm({
      title: "Cancel this event?",
      description: "All registrants will be notified that the event has been cancelled.",
      confirmLabel: "Cancel Event",
      variant: "warning",
    });
    if (!ok) return;

    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/sheets/${sheetId}/cancel`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to cancel sheet.");
      }
      router.refresh();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to cancel.";
      setError(message);
      setDeleting(false);
    }
  }

  return (
    <div>
      <button
        onClick={handleDelete}
        disabled={deleting}
        className="btn-danger w-full sm:w-auto"
      >
        {deleting ? "Cancelling..." : "Cancel Event"}
      </button>
      <FormError message={error} />
    </div>
  );
}
