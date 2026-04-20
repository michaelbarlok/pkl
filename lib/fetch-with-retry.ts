/**
 * Shared fetch-with-retry helper for POST/PUT/PATCH endpoints that we
 * want to survive spotty mobile networks and transient 5xx errors.
 *
 * Modeled on the retry loop we battle-tested on sheet-actions.tsx for
 * concurrent signup spikes. Kept as a plain function (no React
 * dependencies) so both client components and server-action call sites
 * can reuse it.
 *
 * Semantics:
 *  - Each attempt gets its own AbortController with a hard timeout.
 *  - Only retries on timeout / network error / 5xx. 4xx stops
 *    immediately — the server has decided, retrying won't change the
 *    answer (and would mask real bugs).
 *  - Exponential backoff with jitter so concurrent retries from
 *    multiple clients don't pile into the DB lock at the same moment.
 *
 * Callers must make sure their endpoint is idempotent for at-least-once
 * delivery. The /api/sessions/[id]/score POST already rejects duplicate
 * submissions with 409, which is the correct behavior under retry.
 */

const DEFAULTS = {
  attemptTimeoutMs: 20_000,
  maxAttempts: 4,
  slowThresholdMs: 5_000,
};

export type RetryOptions = {
  attemptTimeoutMs?: number;
  maxAttempts?: number;
  slowThresholdMs?: number;
  /** Notified once when an attempt crosses the slow threshold; reset
   *  before each new attempt. Lets the UI flip to "Still working...". */
  onSlow?: (slow: boolean) => void;
  /** Optional external AbortSignal — aborting it cancels the current
   *  attempt AND short-circuits the retry loop (e.g. unmount cleanup). */
  signal?: AbortSignal;
};

function backoffDelay(attempt: number): number {
  const base = Math.pow(2, attempt - 1) * 500;
  const jitter = Math.random() * 250;
  return base + jitter;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  opts: RetryOptions = {}
): Promise<Response> {
  const attemptTimeoutMs = opts.attemptTimeoutMs ?? DEFAULTS.attemptTimeoutMs;
  const maxAttempts = opts.maxAttempts ?? DEFAULTS.maxAttempts;
  const slowThresholdMs = opts.slowThresholdMs ?? DEFAULTS.slowThresholdMs;

  let lastErr: unknown = null;

  for (let i = 1; i <= maxAttempts; i++) {
    if (opts.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    const controller = new AbortController();
    const hardStop = setTimeout(() => controller.abort(), attemptTimeoutMs);
    const slowTimer = setTimeout(() => opts.onSlow?.(true), slowThresholdMs);

    // Propagate external aborts into this attempt's controller.
    const onExternalAbort = () => controller.abort();
    opts.signal?.addEventListener("abort", onExternalAbort);

    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      if (res.status >= 500) {
        // Transient — let the retry loop pick it up.
        throw new Error(`server_${res.status}`);
      }
      return res;
    } catch (err) {
      lastErr = err;
      // If the external signal fired, don't retry — the caller decided.
      if (opts.signal?.aborted) throw err;
      if (i === maxAttempts) break;
      await sleep(backoffDelay(i));
    } finally {
      clearTimeout(hardStop);
      clearTimeout(slowTimer);
      opts.onSlow?.(false);
      opts.signal?.removeEventListener("abort", onExternalAbort);
    }
  }

  throw lastErr ?? new Error("unknown_error");
}
