/**
 * Simple in-memory rate limiter for Next.js middleware (edge runtime).
 *
 * Uses a sliding window counter per IP. The Map persists across requests
 * in the same middleware instance (Vercel edge or Node.js server).
 * Resets on deploy — acceptable for abuse prevention, not billing.
 *
 * For distributed rate limiting across regions, swap this for @upstash/ratelimit.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Periodic cleanup to prevent memory leaks (runs at most once per minute)
let lastCleanup = 0;
function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < 60_000) return;
  lastCleanup = now;
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }
}

/**
 * Check if a request should be rate-limited.
 *
 * @param key    Unique identifier (typically IP or IP + route prefix)
 * @param limit  Max requests allowed in the window
 * @param windowMs  Window duration in milliseconds
 * @returns { limited: boolean, remaining: number, resetAt: number }
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): { limited: boolean; remaining: number; resetAt: number } {
  cleanup();

  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    // New window
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { limited: false, remaining: limit - 1, resetAt: now + windowMs };
  }

  entry.count++;

  if (entry.count > limit) {
    return { limited: true, remaining: 0, resetAt: entry.resetAt };
  }

  return { limited: false, remaining: limit - entry.count, resetAt: entry.resetAt };
}
