"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function HideTournamentToggle({
  tournamentId,
  isHidden,
}: {
  tournamentId: string;
  isHidden: boolean;
}) {
  const [hidden, setHidden] = useState(isHidden);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function toggle() {
    setLoading(true);
    const res = await fetch(`/api/tournaments/${tournamentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_hidden: !hidden }),
    });
    if (res.ok) {
      setHidden(!hidden);
      router.refresh();
    }
    setLoading(false);
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      title={hidden ? "Show tournament" : "Hide tournament"}
      className={`text-xs px-2 py-0.5 rounded transition-colors ${
        hidden
          ? "bg-amber-900/40 text-amber-300 hover:bg-amber-900/60"
          : "bg-surface-overlay text-surface-muted hover:text-dark-200"
      }`}
    >
      {hidden ? "Hidden" : "Visible"}
    </button>
  );
}
