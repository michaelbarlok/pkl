-- Preserve the CSV-imported rolling win% as its own column so the
-- session recompute can blend imported "virtual" sessions into the
-- rolling window until real sessions fill it up.
--
-- The group's `pct_window_sessions` (default 6) defines the rolling
-- window. Recompute will treat an imported stat of (win_pct=74.72%,
-- total_sessions=14) as 14 virtual past sessions at 74.72%. After the
-- player's first real session, the window is 13 virtual + 1 real;
-- after 14 real sessions the imported baseline has fully aged out.
--
-- imported_win_pct is deliberately NULLable: a NULL value means the
-- player was never imported (the recompute uses pure real data with
-- no virtual borrow). Once set, it never changes.
ALTER TABLE group_memberships
  ADD COLUMN IF NOT EXISTS imported_win_pct NUMERIC;

-- One-shot backfill: for anyone already imported (total_sessions > 0),
-- snapshot the current win_pct as the imported baseline. This is
-- correct as long as no real sessions have been played since import
-- (otherwise win_pct would already be blended). For the current
-- production state, no imported group has run a real session through
-- the platform yet, so the backfill is accurate.
UPDATE group_memberships
SET imported_win_pct = win_pct
WHERE imported_win_pct IS NULL
  AND total_sessions > 0;
