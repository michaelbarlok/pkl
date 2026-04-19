"use client";

import { FormError } from "@/components/form-error";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { RegistrationStatus } from "@/types/database";

interface SheetActionsProps {
  sheetId: string;
  profileId: string;
  myRegistration: { id: string; status: RegistrationStatus } | null;
  signupClosed: boolean;
  withdrawClosed: boolean;
  isFull: boolean;
}

/**
 * The primary action card for a sheet.
 *
 * Layout is deliberately bigger than a normal row: when someone lands on
 * a sheet page the #1 question is "am I signed up?" and the #2 is "can I
 * still sign up?" — we answer both visually before text.
 *
 * When the user hasn't acted yet and signup is open, the CTA pulses to
 * draw the eye. Once registered, the CTA flips to a calm secondary
 * confirmation with a muted Withdraw.
 */
export function SheetActions({
  sheetId,
  profileId: _profileId,
  myRegistration,
  signupClosed,
  withdrawClosed,
  isFull,
}: SheetActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignUp() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/sheets/${sheetId}/signup`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to sign up.");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to sign up.");
    } finally {
      setLoading(false);
    }
  }

  async function handleWithdraw() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/sheets/${sheetId}/withdraw`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to withdraw.");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to withdraw.");
    } finally {
      setLoading(false);
    }
  }

  const isRegistered =
    myRegistration &&
    (myRegistration.status === "confirmed" || myRegistration.status === "waitlist");

  // The CTA pulses in exactly one case: signup is open, user isn't
  // registered yet, and we're not mid-request. Anything else is calm.
  const pulse = !isRegistered && !signupClosed && !loading;

  const ctaLabel = loading
    ? (isRegistered ? "Withdrawing…" : "Signing up…")
    : isRegistered
      ? "Withdraw"
      : signupClosed
        ? "Sign-up closed"
        : isFull
          ? "Join waitlist"
          : "Sign up";

  return (
    <div className="rounded-2xl bg-surface-raised ring-1 ring-surface-border p-4 sm:p-5">
      {error && (
        <div className="mb-3">
          <FormError message={error} />
        </div>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          {isRegistered ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide text-surface-muted">
                Your status
              </p>
              <p className="mt-0.5 text-lg font-semibold text-dark-100">
                You&apos;re{" "}
                {myRegistration.status === "confirmed" ? (
                  <span className="text-teal-300">confirmed</span>
                ) : (
                  <span className="text-accent-300">on the waitlist</span>
                )}
                .
              </p>
              {withdrawClosed && (
                <p className="mt-1 text-xs text-surface-muted">
                  The withdraw deadline has passed — contact an admin if you need off the roster.
                </p>
              )}
            </>
          ) : (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide text-surface-muted">
                Ready to play?
              </p>
              <p className="mt-0.5 text-lg font-semibold text-dark-100">
                {signupClosed
                  ? "Sign-up is closed for this event."
                  : isFull
                    ? "This event is full — join the waitlist to hold your spot."
                    : "Sign up to lock in your seat."}
              </p>
            </>
          )}
        </div>

        <div className="shrink-0">
          {isRegistered ? (
            <button
              type="button"
              onClick={handleWithdraw}
              disabled={loading || withdrawClosed}
              className="btn-secondary btn-md"
              title={withdrawClosed ? "Withdraw deadline has passed" : undefined}
            >
              {ctaLabel}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSignUp}
              disabled={loading || signupClosed}
              className={`relative inline-flex items-center justify-center rounded-xl px-6 py-3 text-base font-semibold text-white shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${
                isFull
                  ? "bg-gradient-to-r from-accent-500 to-accent-600 hover:from-accent-400 hover:to-accent-500 shadow-accent-500/30"
                  : "bg-gradient-to-r from-brand-500 to-teal-500 hover:from-brand-400 hover:to-teal-400 shadow-brand-500/30"
              }`}
            >
              {pulse && (
                <span className="absolute inset-0 rounded-xl bg-brand-400 opacity-30 animate-ping" aria-hidden />
              )}
              <span className="relative">{ctaLabel}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
