-- ============================================================
-- Migration 043: Per-division pool play settings
-- Stores organizer-configured pool rounds per division as JSONB.
-- Example: { "mens_all_ages_3.5": { "pool_rounds": 4 } }
-- ============================================================

ALTER TABLE tournaments
  ADD COLUMN division_settings JSONB DEFAULT '{}';
