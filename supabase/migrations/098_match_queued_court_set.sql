-- ============================================================
-- Migration 098: Snapshot eligible courts at enqueue time
--
-- "Any changes to the court ranges should apply to upcoming
-- matches that enter the queue but leave matches that are already
-- in the queue alone." Concretely: when a match enters the queue,
-- record the set of court numbers it's allowed to land on under
-- the THEN-current range layout. The assignment loop reads this
-- snapshot rather than recomputing from the live ranges, so a
-- subsequent edit to tournament_court_ranges only affects matches
-- that haven't been queued yet.
--
-- NULL value means "no snapshot was taken" — either this match
-- pre-dates the column (in which case treat as no constraint /
-- legacy behaviour) or it just hasn't been enqueued yet.
-- ============================================================

ALTER TABLE tournament_matches
  ADD COLUMN IF NOT EXISTS queued_court_set INTEGER[];

NOTIFY pgrst, 'reload schema';
