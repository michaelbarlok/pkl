/**
 * Blend CSV-imported rolling-point% into the recompute's rolling
 * window so imported baselines don't evaporate the moment a player
 * finishes their first real session.
 *
 * Semantics: the group's `pct_window_sessions` (default 6, but larger
 * values like 14 are common) defines the rolling window. For a player
 * whose imported stats are (imported_win_pct=74.72, total_sessions=14)
 * and who has just finished their 1st real session, this returns the
 * point% of "last 14 sessions" = 13 virtual + 1 real. After 14 real
 * sessions the virtual contribution is zero and the formula is pure
 * real-data rolling point%.
 *
 * The function is pure (no DB calls) so it can be unit-tested.
 */

export interface BlendInputs {
  /** Group's pct_window_sessions setting (e.g. 14). */
  windowSize: number;
  /** Points scored by this player across their games in the last
   *  `realSessionsInWindow` real sessions that have game_results. */
  realPointsScored: number;
  /** Sum of max(score_a, score_b) across those same games. */
  realPointsPossible: number;
  /** Count of distinct real sessions (with game_results) included in
   *  the sums above. Capped at windowSize by the caller. */
  realSessionsInWindow: number;
  /** Cumulative total_sessions on group_memberships — imported count
   *  plus any real sessions played since. */
  totalSessions: number;
  /** The CSV-imported rolling point% snapshot. NULL means never
   *  imported; in that case no virtual blending happens. */
  importedWinPct: number | null;
}

/** Return the rolling point% (0-100, 2 decimals). */
export function blendRollingPointPct(input: BlendInputs): number {
  const {
    windowSize,
    realPointsScored,
    realPointsPossible,
    realSessionsInWindow,
    totalSessions,
    importedWinPct,
  } = input;

  // No real games yet. If we have an imported baseline, return it
  // unchanged — anything else would be making up numbers.
  if (realPointsPossible <= 0) {
    return importedWinPct ?? 0;
  }

  const realPct = (realPointsScored / realPointsPossible) * 100;

  // Player was never imported, or the window is already full of real
  // sessions: pure real-data rolling point%.
  const virtualSessions = Math.max(
    0,
    Math.min(windowSize, totalSessions) - realSessionsInWindow
  );
  if (importedWinPct == null || virtualSessions <= 0) {
    return round2(realPct);
  }

  // Blend. We approximate each virtual session's "points possible" as
  // the real-session average so the weighting stays consistent with
  // the per-point aggregation the rest of the rolling window uses.
  const avgPossiblePerSession = realPointsPossible / realSessionsInWindow;
  const virtualPointsPossible = virtualSessions * avgPossiblePerSession;
  const virtualPointsScored = (importedWinPct / 100) * virtualPointsPossible;

  const totalScored = realPointsScored + virtualPointsScored;
  const totalPossible = realPointsPossible + virtualPointsPossible;

  return round2((totalScored / totalPossible) * 100);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
