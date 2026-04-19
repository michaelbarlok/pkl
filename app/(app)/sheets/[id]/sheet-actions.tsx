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

// If a single attempt is pending for more than this long, switch the label
// to "Still working..." so users under a concurrent-signup spike don't
// assume the site froze and start hammering refresh.
const SLOW_THRESHOLD_MS = 5_000;
// Hard per-attempt cap. Each attempt aborts at this point and the retry
// loop kicks in. The server RPC is idempotent (already_registered short-
// circuit) so retries can't duplicate a registration.
const ATTEMPT_TIMEOUT_MS = 20_000;
// Total number of attempts before we surface an error to the user.
const MAX_ATTEMPTS = 4;

/**
 * Exponential backoff with jitter (ms). Attempt 1 is immediate, 2 waits
 * ~1s, 3 waits ~3s, 4 waits ~7s. Jitter spreads concurrent retries so
 * they don't all hit the DB lock at the same moment.
 */
function backoffDelay(attempt: number): number {
  const base = Math.pow(2, attempt - 1) * 500;
  const jitter = Math.random() * 250;
  return base + jitter;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * The primary action card for a sheet.
 *
 * Hardened for concurrent-signup spikes:
 *  - Click time is captured at the moment of the button press and sent on
 *    every attempt. The server uses it as `signed_up_at` so ordering
 *    reflects who actually clicked first, not whose request happened to
 *    reach the DB lock first.
 *  - Auto-retries on transient failures (timeouts, network errors, 5xx)
 *    with exponential backoff + jitter, up to 4 attempts. 4xx errors
 *    (sheet closed, etc.) stop immediately — retrying won't change the
 *    answer.
 *  - Progressive "Still working..." label after 5s of a single attempt.
 *  - Hard per-attempt timeout so a stuck request can't freeze the button
 *    forever.
 *  - All state cleans up on unmount so nothing leaks if the user
 *    navigates away mid-request.
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
  const unmountedRef = useRef(false);

  useEffect(() => {
    return () => {
      unmountedRef.current = true;
      abortRef.current?.abort();
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
    };
  }, []);

  /**
   * Fire a single attempt with its own timeout + "still working" timer.
   * Returns the Response on ok or 4xx (caller decides whether to retry),
   * or throws on network / abort / 5xx so the retry loop picks it up.
   */
  async function attempt(url: string, body: Record<string, unknown>): Promise<Response> {
    const controller = new AbortController();
    abortRef.current = controller;
    const hardStop = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS);
    slowTimerRef.current = setTimeout(() => setSlow(true), SLOW_THRESHOLD_MS);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      // 5xx: let the retry loop handle it.
      if (res.status >= 500) {
        throw new Error(`server_${res.status}`);
      }
      return res;
    } finally {
      clearTimeout(hardStop);
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
      setSlow(false);
      abortRef.current = null;
    }
  }

  async function runWithRetry(url: string, body: Record<string, unknown>): Promise<Response | null> {
    let lastErr: unknown = null;
    for (let i = 1; i <= MAX_ATTEMPTS; i++) {
      if (unmountedRef.current) return null;
      try {
        const res = await attempt(url, body);
        // Non-5xx (ok or 4xx) — return to caller immediately.
        return res;
      } catch (err) {
        lastErr = err;
        // Don't retry past the last attempt.
        if (i === MAX_ATTEMPTS) break;
        await sleep(backoffDelay(i));
      }
    }
    // All attempts exhausted.
    throw lastErr ?? new Error("unknown_error");
  }

  async function run(url: string, verb: "signup" | "withdraw") {
    setLoading(true);
    setError(null);
    setSlow(false);
    setAttempted(true);

    // Capture click time ONCE, here. Every retry sends the same value so
    // the user's place in line reflects their original click, not a
    // later retry.
    const clickedAt = new Date().toISOString();

    try {
      const res = await runWithRetry(url, { clicked_at: clickedAt });
      if (!res) return; // component unmounted mid-flight
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error || `Failed to ${verb}.`);
      }
      router.refresh();
    } catch (err: unknown) {
      if (unmountedRef.current) return;
      const name = (err as { name?: string })?.name;
      const msg = (err as { message?: string })?.message ?? "";
      if (name === "AbortError" || msg.startsWith("server_")) {
        setError(
          `We couldn't confirm your ${verb === "signup" ? "sign-up" : "withdrawal"} after several tries. It may have gone through — refresh to check, or tap to try again.`
        );
      } else {
        setError(msg || `Failed to ${verb}.`);
      }
    } finally {
      if (!unmountedRef.current) setLoading(false);
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

  const pulse = !isRegistered && !signupClosed && !loading;

  const ctaLabel = loading
    ? slow
      ? "Still working…"
      : isRegistered
        ? "Withdrawing…"
        : "Signing up…"
    : attempted && error
      ? "Try again"
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
