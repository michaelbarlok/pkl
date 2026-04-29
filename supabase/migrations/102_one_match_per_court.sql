-- ============================================================
-- Migration 102: court-uniqueness guard for live tournament play
--
-- Two parallel score-recordings on the same tournament could each
-- decide "court N is free" and assign different matches to it before
-- either write committed — leaving two pending matches sharing
-- court_number = N. There was no DB-level guard against that.
--
-- This partial unique index makes the conflict impossible at the
-- storage layer: only one pending match per (tournament, court) at
-- a time. The application catches the 23505 it'll see on a losing
-- race and skips that assignment (the next pass picks the match up).
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS tournament_matches_one_match_per_court_idx
  ON tournament_matches (tournament_id, court_number)
  WHERE court_number IS NOT NULL AND status = 'pending';

NOTIFY pgrst, 'reload schema';
