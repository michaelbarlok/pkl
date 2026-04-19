/**
 * Tests for the signup route's clicked_at validation rules.
 *
 * Copies the exact validation block from
 * app/api/sheets/[id]/signup/route.ts so we can lock in the contract:
 *   - Accept a click timestamp up to 2 minutes in the past.
 *   - Accept a click timestamp up to 5 seconds in the future (clock skew).
 *   - Reject anything older or further in the future.
 *   - Reject malformed / non-parsable strings.
 *   - Null / undefined / empty → fall back (returns null so RPC uses now()).
 *
 * If these rules change, update the production route AND this test —
 * they're a single spec split across two places on purpose so drift is
 * visible.
 */

function validateClickedAt(raw: unknown, now = Date.now()): string | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  const parsed = new Date(raw);
  const ms = parsed.getTime();
  if (Number.isNaN(ms)) return null;
  if (ms > now + 5_000) return null;
  if (ms < now - 120_000) return null;
  return parsed.toISOString();
}

describe("validateClickedAt", () => {
  const NOW = 1_700_000_000_000;

  test("accepts a timestamp that matches now exactly", () => {
    const iso = new Date(NOW).toISOString();
    expect(validateClickedAt(iso, NOW)).toBe(iso);
  });

  test("accepts a timestamp 60 seconds in the past", () => {
    const iso = new Date(NOW - 60_000).toISOString();
    expect(validateClickedAt(iso, NOW)).toBe(iso);
  });

  test("accepts a timestamp at the 2-minute boundary", () => {
    const iso = new Date(NOW - 119_000).toISOString();
    expect(validateClickedAt(iso, NOW)).toBe(iso);
  });

  test("rejects a timestamp older than 2 minutes", () => {
    const iso = new Date(NOW - 121_000).toISOString();
    expect(validateClickedAt(iso, NOW)).toBeNull();
  });

  test("accepts small clock-skew into the future", () => {
    const iso = new Date(NOW + 3_000).toISOString();
    expect(validateClickedAt(iso, NOW)).toBe(iso);
  });

  test("rejects a timestamp more than 5 seconds in the future", () => {
    const iso = new Date(NOW + 6_000).toISOString();
    expect(validateClickedAt(iso, NOW)).toBeNull();
  });

  test("rejects malformed strings", () => {
    expect(validateClickedAt("not-a-date", NOW)).toBeNull();
    expect(validateClickedAt("", NOW)).toBeNull();
  });

  test("rejects non-string input", () => {
    expect(validateClickedAt(undefined, NOW)).toBeNull();
    expect(validateClickedAt(null, NOW)).toBeNull();
    expect(validateClickedAt(1234567890, NOW)).toBeNull();
    expect(validateClickedAt({ clicked_at: "2026-04-21" }, NOW)).toBeNull();
  });
});

/**
 * Backoff math used by the signup retry loop. Kept in sync with
 * sheet-actions.tsx — if the constants change there, change them here.
 */
function backoffDelay(attempt: number): number {
  const base = Math.pow(2, attempt - 1) * 500;
  // Tests use the deterministic base; real code adds up to 250ms of
  // jitter on top.
  return base;
}

describe("backoffDelay", () => {
  test("grows exponentially across attempts", () => {
    expect(backoffDelay(1)).toBe(500);
    expect(backoffDelay(2)).toBe(1000);
    expect(backoffDelay(3)).toBe(2000);
    expect(backoffDelay(4)).toBe(4000);
  });

  test("total retry budget stays well under serverless timeout", () => {
    // Even if every attempt took its full 20s cap AND we waited the
    // maximum backoff between them, we want the total to fit inside the
    // user's patience window (~60-90s).
    const attemptCap = 20_000;
    const total =
      attemptCap + backoffDelay(1) + attemptCap + backoffDelay(2) + attemptCap + backoffDelay(3) + attemptCap;
    // 20 + 0.5 + 20 + 1 + 20 + 2 + 20 = 83.5s worst case.
    expect(total).toBeLessThan(90_000);
  });
});
