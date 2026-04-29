"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface PartnerlessTeam {
  id: string;
  division: string | null;
  divisionLabel: string | null;
  playerName: string;
}

/**
 * Drop-in replacement for the generic StatusAdvanceButton when the
 * advance is "Open registration → Close registration." Adds a
 * partnerless-team guard: before the status flips, the API checks
 * for confirmed registrations with `partner_id IS NULL` and returns
 * the list. If any exist, this component pops a modal showing each
 * team and offers two paths forward — withdraw them all and close,
 * or cancel and go fix them by hand.
 *
 * The plain "Reopen Registration" / "Open Registration" actions
 * still go through the existing server-action StatusAdvanceButton.
 */
export function CloseRegistrationButton({ tournamentId }: { tournamentId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [partnerless, setPartnerless] = useState<PartnerlessTeam[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function attemptClose(withdraw_partnerless: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/tournaments/${tournamentId}/close-registration`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ withdraw_partnerless }),
        }
      );
      const data = await res.json().catch(() => ({}));

      // 409 with partnerless_teams payload → render the modal.
      if (res.status === 409 && Array.isArray(data.partnerless_teams)) {
        setPartnerless(data.partnerless_teams);
        return;
      }
      if (!res.ok) {
        setError(data.error ?? "Could not close registration.");
        return;
      }

      // Success — modal closes (if it was open), state resets, page
      // refreshes so the organizer sees the new registration_closed
      // panel + DivisionReview.
      setPartnerless(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error.");
    } finally {
      setBusy(false);
    }
  }

  // Group the partnerless teams by division for a tidier modal.
  const groupedPartnerless = (partnerless ?? []).reduce<Record<string, PartnerlessTeam[]>>(
    (acc, t) => {
      const key = t.divisionLabel ?? "No division";
      if (!acc[key]) acc[key] = [];
      acc[key].push(t);
      return acc;
    },
    {}
  );

  return (
    <>
      <button
        type="button"
        onClick={() => attemptClose(false)}
        disabled={busy}
        className="btn-primary"
      >
        {busy && partnerless === null ? "Checking…" : "Close Registration"}
      </button>
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}

      {partnerless !== null && partnerless.length > 0 && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="partnerless-modal-title"
        >
          <div className="card w-full max-w-lg space-y-4 max-h-[90vh] overflow-y-auto">
            <div>
              <h2
                id="partnerless-modal-title"
                className="text-base font-semibold text-dark-100"
              >
                {partnerless.length} team{partnerless.length === 1 ? "" : "s"} still need a partner
              </h2>
              <p className="mt-1 text-xs text-surface-muted">
                These players registered without a partner. Pool play matches
                can&apos;t be generated for half-teams, so each one needs to
                either find a partner or be withdrawn before the tournament
                can advance.
              </p>
            </div>

            <div className="space-y-3 rounded-lg border border-surface-border bg-surface-overlay/40 p-3">
              {Object.entries(groupedPartnerless).map(([divisionLabel, teams]) => (
                <div key={divisionLabel}>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-surface-muted">
                    {divisionLabel}
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {teams.map((t) => (
                      <li key={t.id} className="text-sm text-dark-100">
                        {t.playerName}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            {error && (
              <p className="text-xs text-red-400" role="alert">
                {error}
              </p>
            )}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  setPartnerless(null);
                  setError(null);
                }}
                disabled={busy}
                className="btn-secondary text-sm"
              >
                Cancel — I&apos;ll fix them
              </button>
              <button
                type="button"
                onClick={() => attemptClose(true)}
                disabled={busy}
                className="btn-secondary !border-red-500/50 !text-red-400 text-sm"
              >
                {busy
                  ? "Withdrawing…"
                  : `Withdraw ${partnerless.length} team${partnerless.length === 1 ? "" : "s"} and close`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
