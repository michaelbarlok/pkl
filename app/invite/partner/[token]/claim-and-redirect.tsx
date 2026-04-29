"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

/**
 * Fires the claim API as soon as we know the visitor is signed in.
 * On success: redirect to the tournament page so they see their
 * confirmed-with-partner registration. On failure: surface the
 * specific server message so they understand why (already partnered,
 * already in a same-gender division, etc.).
 *
 * This intentionally runs without an explicit "Accept" button — the
 * sign-up flow already represented intent. Adding another click here
 * would feel redundant for the most common path (someone clicks the
 * SMS link, registers, and expects to land in the tournament).
 */
export function ClaimAndRedirect({
  token,
  tournamentId,
  inviterName,
  tournamentTitle,
}: {
  token: string;
  tournamentId: string;
  inviterName: string | null;
  tournamentTitle: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [claimed, setClaimed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const res = await fetch(`/api/invite/partner/${token}/claim`, {
          method: "POST",
        });
        if (cancelled) return;
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error ?? "We couldn't accept this invite.");
          return;
        }
        setClaimed(true);
        router.push(`/tournaments/${tournamentId}`);
        router.refresh();
      } catch {
        if (!cancelled) setError("Network error — please try again.");
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [token, tournamentId, router]);

  if (error) {
    return (
      <div className="space-y-3 pt-2">
        <p className="text-sm text-red-400">{error}</p>
        <Link
          href={`/tournaments/${tournamentId}`}
          className="btn-secondary inline-block"
        >
          View tournament
        </Link>
      </div>
    );
  }

  return (
    <p className="text-sm text-surface-muted pt-2">
      {claimed
        ? `Locked in with ${inviterName ?? "your partner"} — taking you to ${tournamentTitle}…`
        : "Confirming…"}
    </p>
  );
}
