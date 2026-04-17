"use client";

import { useState } from "react";

export function ShareBracketButton({ tournamentId }: { tournamentId: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const url = `${window.location.origin}/tournaments/${tournamentId}/bracket`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Fallback for browsers that block clipboard without HTTPS
      const el = document.createElement("input");
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button onClick={handleCopy} className="btn-secondary text-xs shrink-0">
      {copied ? "Copied!" : "Share Bracket"}
    </button>
  );
}
