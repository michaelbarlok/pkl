-- ============================================================
-- Migration 093: Tournament win-by-2 toggle
--
-- Adds an organizer-controlled win-by-2 rule for tournaments.
-- Mirrors group_preferences.win_by_2 (added in 003) so both
-- ladder leagues and tournaments can enforce the same scoring
-- contract during validation.
--
-- Defaults to FALSE so existing tournaments retain their current
-- "first to N points" behavior. Score validation only enforces
-- the rule when the column is TRUE.
-- ============================================================

ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS win_by_2 BOOLEAN NOT NULL DEFAULT FALSE;

-- Force PostgREST to reload its schema cache so the new column is
-- visible to the API immediately. Without this, inserts referencing
-- win_by_2 fail with "Could not find the 'win_by_2' column of
-- 'tournaments' in the schema cache" until the cache TTL expires.
NOTIFY pgrst, 'reload schema';
