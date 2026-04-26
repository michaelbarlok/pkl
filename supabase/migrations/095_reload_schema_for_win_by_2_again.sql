-- ============================================================
-- Migration 095: Reload PostgREST schema cache (again)
--
-- The create-tournament flow is still failing with
-- "Could not find the 'win_by_2' column of 'tournaments' in
-- the schema cache" even after migrations 093/094, meaning
-- the NOTIFY from 094 did not reach the live PostgREST
-- instance (or the cache was repopulated from a stale source
-- before the column was visible).
--
-- Per CLAUDE.md, the prescribed remedy is a one-line follow-up
-- migration that just sends the reload signal.
-- ============================================================

NOTIFY pgrst, 'reload schema';
