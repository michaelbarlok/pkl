"use client";

import { FormError } from "@/components/form-error";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { RegistrationStatus } from "@/types/database";

interface SheetActionsProps {
  sheetId: string;
  profileId: string;
  myRegistration: { id: string; status: RegistrationStatus } | null;
  signupClosed: boolean;
  withdrawClosed: boolean;
  isFull: boolean;
}

// If a request is pending for more than this long, we switch the label to a
// "still working..." message so users under a concurrent-signup spike don't
// assume the site froze and start hammering refresh.
const SLOW_THRESHOLD_MS = 5_000;
// Hard client-side cap. If we haven't heard back by this point, abort so
// the button isn't stuck forever. The server's signup RPC is idempotent
// (checks `already_registered` before inserting), so retrying is always
// safe — no risk of a duplicate registration.
const REQUEST_TIMEOUT_MS = 20_000;

/**
 * The primary action card for a sheet.
 *
 * Layout is deliberately bigger than a normal row: when someone lands on
 * a sheet page the #1 question is "am I signed up?" and the #2 is "can I
 * still sign up?" — we answer both visually before text.
 *
 * The handler is hardened for concurrent-signup spikes:
 *  - AbortController hard timeout so a stuck fetch can't freeze the CTA.
 *  - Progressive "still working" label after 5s so users don't panic-refresh.
 *  - On any failure, the user can just tap again — the server RPC is
 *    idempotent and will either complete the signup or return their
 *    existing registration instead of inserting a duplicate.
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
  const [slow, setSlow] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cancel any in-flight request + timers when the component unmounts
  // (e.g. user navigated away mid-spinner).
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
    };
  }, []);

  async function run(url: string, verb: "signup" | "withdraw") {
    setLoading(true);
    setError(null);
    setSlow(false);
    setAttempted(true);

    const controller = new AbortController();
    abortRef.current = controller;
    const timeoutHandle = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    slowTimerRef.current = setTimeout(() => setSlow(true), SLOW_THRESHOLD_MS);

    try {
      const res = await fetch(url, { method: "POST", signal: controller.signal });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || `Failed to ${verb}.`);
      router.refresh();
    } catch (err: unknown) {
      // AbortError fires both on our timeout and on unmount. We only want
      // to surface an error for the timeout case.
      if ((err as { name?: string })?.name === "AbortError") {
        setError(
          `That took longer than expected. Your ${verb === "signup" ? "sign-up" : "withdrawal"} may have gone through — tap again to retry, or refresh to check your status.`
        );
      } else {
        setError(err instanceof Error ? err.message : `Failed to ${verb}.`);
      }
    } finally {
      clearTimeout(timeoutHandle);
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
      abortRef.current = null;
      setLoading(false);
      setSlow(false);
    }
  }

  async function handleSignUp() {
    await run(`/api/sheets/${sheetId}/signup`, "signup");
  }

  async function handleWithdraw() {
    await run(`/api/sheets/${sheetId}/withdraw`, "withdraw");
  }

  const isRegistered =
    myRegistration &&
    (myRegistration.status === "confirmed" || myRegistration.status === "waitlist");

  // The CTA pulses in exactly one case: signup is open, user isn't
  // registered yet, and we're not mid-request. Anything else is calm.
  const pulse = !isRegistered && !signupClosed && !loading;

  const ctaLabel = loading
    ? slow
      ? (isRegistered ? "Still working…" : "Still working…")
      : (isRegistered ? "Withdrawing…" : "Signing up…")
    : attempted && error
      ? (isRegistered ? "Try again" : "Try again")
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
              {slow && (
                <p className="mt-1 text-xs text-surface-muted">
                  Busy sheet — hang tight, your spot is being locked in.
                </p>
              )}
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
