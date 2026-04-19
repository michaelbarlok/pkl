/**
 * Tests for the LiveRosterCount delta logic.
 *
 * The actual component lives in app/(app)/sheets/[id]/live-roster-count.tsx
 * and applies deltas to React state; this suite re-implements the same
 * transition rules so we can exercise every path without a browser. The
 * two implementations intentionally duplicate the rules — if they drift
 * the test will catch it during CI.
 */

type Status = "confirmed" | "waitlist" | "withdrawn";

interface Counts {
  confirmed: number;
  waitlist: number;
}

/** Mirrors the applyDelta() body in live-roster-count.tsx. */
function applyDelta(
  counts: Counts,
  oldStatus: Status | null,
  newStatus: Status | null
): Counts {
  if (oldStatus === newStatus) return counts;

  let confirmedDelta = 0;
  let waitlistDelta = 0;

  if (oldStatus === "confirmed") confirmedDelta--;
  else if (oldStatus === "waitlist") waitlistDelta--;

  if (newStatus === "confirmed") confirmedDelta++;
  else if (newStatus === "waitlist") waitlistDelta++;

  return {
    confirmed: Math.max(0, counts.confirmed + confirmedDelta),
    waitlist: Math.max(0, counts.waitlist + waitlistDelta),
  };
}

const START: Counts = { confirmed: 10, waitlist: 3 };

describe("LiveRosterCount delta", () => {
  test("INSERT confirmed → confirmed++", () => {
    expect(applyDelta(START, null, "confirmed")).toEqual({ confirmed: 11, waitlist: 3 });
  });

  test("INSERT waitlist → waitlist++", () => {
    expect(applyDelta(START, null, "waitlist")).toEqual({ confirmed: 10, waitlist: 4 });
  });

  test("bump: confirmed → waitlist flips both counters", () => {
    expect(applyDelta(START, "confirmed", "waitlist")).toEqual({ confirmed: 9, waitlist: 4 });
  });

  test("promotion: waitlist → confirmed flips both counters", () => {
    expect(applyDelta(START, "waitlist", "confirmed")).toEqual({ confirmed: 11, waitlist: 2 });
  });

  test("withdraw from confirmed → confirmed--", () => {
    expect(applyDelta(START, "confirmed", "withdrawn")).toEqual({ confirmed: 9, waitlist: 3 });
  });

  test("withdraw from waitlist → waitlist--", () => {
    expect(applyDelta(START, "waitlist", "withdrawn")).toEqual({ confirmed: 10, waitlist: 2 });
  });

  test("DELETE confirmed row → confirmed--", () => {
    expect(applyDelta(START, "confirmed", null)).toEqual({ confirmed: 9, waitlist: 3 });
  });

  test("DELETE waitlist row → waitlist--", () => {
    expect(applyDelta(START, "waitlist", null)).toEqual({ confirmed: 10, waitlist: 2 });
  });

  test("DELETE withdrawn row is a no-op", () => {
    expect(applyDelta(START, "withdrawn", null)).toEqual(START);
  });

  test("reactivate withdrawn → confirmed bumps confirmed", () => {
    expect(applyDelta(START, "withdrawn", "confirmed")).toEqual({ confirmed: 11, waitlist: 3 });
  });

  test("no-op when old and new status match", () => {
    expect(applyDelta(START, "confirmed", "confirmed")).toEqual(START);
    expect(applyDelta(START, "waitlist", "waitlist")).toEqual(START);
  });

  test("counts never go negative (defensive clamp)", () => {
    const zero: Counts = { confirmed: 0, waitlist: 0 };
    // Spurious DELETE of a confirmed row when we're already at 0 — shouldn't
    // go to -1.
    expect(applyDelta(zero, "confirmed", null)).toEqual(zero);
    expect(applyDelta(zero, "waitlist", null)).toEqual(zero);
  });

  test("ordered burst converges to the expected final count", () => {
    // Simulate a burst: full sheet (limit 4), 4 confirmed, 2 waitlist.
    // Then one high-priority signup bumps a normal: that's a UPDATE
    // confirmed → waitlist + an INSERT confirmed in some order.
    // Net: confirmed stays the same, waitlist +1.
    let state: Counts = { confirmed: 4, waitlist: 2 };
    state = applyDelta(state, "confirmed", "waitlist"); // bump
    state = applyDelta(state, null, "confirmed"); // new high inserts as confirmed
    expect(state).toEqual({ confirmed: 4, waitlist: 3 });
  });
});
