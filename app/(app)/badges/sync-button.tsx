"use client";

import { useState, useTransition } from "react";
import { recalculateBadgesAction } from "./actions";

export function SyncBadgesButton() {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function handleSync() {
    setMessage(null);
    startTransition(async () => {
      const result = await recalculateBadgesAction();
      setMessage(
        result.count > 0
          ? `${result.count} new badge${result.count === 1 ? "" : "s"} awarded!`
          : "Badges are up to date."
      );
    });
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleSync}
        disabled={isPending}
        className="btn-secondary text-sm py-1.5 px-3 disabled:opacity-50"
      >
        {isPending ? "Syncing…" : "Sync Badges"}
      </button>
      {message && (
        <span className="text-sm text-teal-300">{message}</span>
      )}
    </div>
  );
}
