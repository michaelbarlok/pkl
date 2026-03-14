-- ============================================================
-- Migration 023: Add division to tournament_matches
-- Each division gets its own bracket, so matches need to track
-- which division they belong to.
-- ============================================================

ALTER TABLE tournament_matches ADD COLUMN division TEXT;
