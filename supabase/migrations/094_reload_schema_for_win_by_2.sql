-- ============================================================
-- Migration 094: Reload PostgREST schema cache
--
-- Migration 093 added tournaments.win_by_2 but PostgREST's
-- schema cache was not refreshed in environments where 093
-- already ran, so inserts from the create-tournament flow fail
-- with: "Could not find the 'win_by_2' column of 'tournaments'
-- in the schema cache".
--
-- This migration just sends the NOTIFY to force a cache reload.
-- ============================================================

NOTIFY pgrst, 'reload schema';
