import { blendRollingPointPct } from "@/lib/blend-imported-win-pct";

/**
 * These tests lock in the exact math the user asked for:
 *
 *   "if a player had 14 sessions played and their percentage is 74.72%,
 *    you should pretend that player scored 74.72% of the points the
 *    past 14 sessions and then use that to calculate their newest 14
 *    sessions using the results of the most recent session."
 *
 * The blend treats imported stats as virtual past sessions inside the
 * rolling window, weighted by the real sessions' average
 * points-possible so per-point aggregation stays consistent with the
 * rest of the rolling calc.
 */

describe("blendRollingPointPct", () => {
  test("never-imported player with no real games yet → 0", () => {
    expect(
      blendRollingPointPct({
        windowSize: 14,
        realPointsScored: 0,
        realPointsPossible: 0,
        realSessionsInWindow: 0,
        totalSessions: 0,
        importedWinPct: null,
      })
    ).toBe(0);
  });

  test("imported player with no real sessions → returns imported pct untouched", () => {
    expect(
      blendRollingPointPct({
        windowSize: 14,
        realPointsScored: 0,
        realPointsPossible: 0,
        realSessionsInWindow: 0,
        totalSessions: 14,
        importedWinPct: 74.72,
      })
    ).toBe(74.72);
  });

  test("user's worked example: 14 imported sessions @ 74.72% + 1 real session", () => {
    // Player's 1 real session: 60 points scored out of 100 possible → 60%.
    // Window = 14: 13 virtual imported + 1 real.
    // virtualPointsPossible = 13 * (100/1) = 1300
    // virtualPointsScored   = 0.7472 * 1300 = 971.36
    // total = (60 + 971.36) / (100 + 1300) = 1031.36 / 1400 = 0.7367 ≈ 73.67%
    const out = blendRollingPointPct({
      windowSize: 14,
      realPointsScored: 60,
      realPointsPossible: 100,
      realSessionsInWindow: 1,
      totalSessions: 14, // pre-bump: import count only, first real session not yet counted
      importedWinPct: 74.72,
    });
    expect(out).toBeCloseTo(73.67, 2);
  });

  test("imported baseline fades out once window fills with real sessions", () => {
    // 14 real sessions' worth of data, imported was 74.72% but should
    // no longer contribute. Real was 50/100 per session → 50% overall.
    const out = blendRollingPointPct({
      windowSize: 14,
      realPointsScored: 700,
      realPointsPossible: 1400,
      realSessionsInWindow: 14,
      totalSessions: 28, // 14 imported + 14 real
      importedWinPct: 74.72,
    });
    expect(out).toBe(50);
  });

  test("player with fewer sessions than window uses only what's available", () => {
    // Imported 5 sessions @ 40%. 2 real sessions played, 50% real performance.
    // total_sessions = 7, window = 14 → effective window = 7.
    // real = 2, virtual = 5. Each real session averaged 100 possible.
    // virtualPossible = 5 * 100 = 500, virtualScored = 200.
    // total = (100 + 200) / (200 + 500) = 300/700 ≈ 42.86%
    const out = blendRollingPointPct({
      windowSize: 14,
      realPointsScored: 100,
      realPointsPossible: 200,
      realSessionsInWindow: 2,
      totalSessions: 7,
      importedWinPct: 40,
    });
    expect(out).toBeCloseTo(42.86, 2);
  });

  test("never-imported player with real games → pure real rolling pct", () => {
    // No imported baseline; formula should reduce to points/possible.
    const out = blendRollingPointPct({
      windowSize: 6,
      realPointsScored: 55,
      realPointsPossible: 100,
      realSessionsInWindow: 3,
      totalSessions: 3,
      importedWinPct: null,
    });
    expect(out).toBe(55);
  });

  test("import with total_sessions below window and a single real session", () => {
    // Import: 3 sessions @ 80%. One real session at 60/100.
    // total_sessions = 3 (pre-bump; this is first real session), window = 14.
    // effective window = min(14, 3) = 3. real = 1, virtual = 2.
    // avgPossible = 100/1 = 100. virtualPossible = 2*100 = 200. virtualScored = 160.
    // total = (60 + 160) / (100 + 200) = 220/300 ≈ 73.33%
    const out = blendRollingPointPct({
      windowSize: 14,
      realPointsScored: 60,
      realPointsPossible: 100,
      realSessionsInWindow: 1,
      totalSessions: 3,
      importedWinPct: 80,
    });
    expect(out).toBeCloseTo(73.33, 2);
  });

  test("rounding stays at 2 decimals", () => {
    const out = blendRollingPointPct({
      windowSize: 14,
      realPointsScored: 73,
      realPointsPossible: 100,
      realSessionsInWindow: 1,
      totalSessions: 14,
      importedWinPct: 74.72,
    });
    // Exercise: ensure the returned value has at most two decimal places.
    expect(out.toString()).toMatch(/^\d+(\.\d{1,2})?$/);
  });
});
