-- ============================================================
-- Migration 034: Rolling Sessions Count & Points Won Stats
-- ============================================================
-- Adds configurable rolling session window for free play stats.
-- Stats are now based on "percent of points won" rather than win/loss.

-- 1. Add rolling_sessions_count to groups (default 14)
ALTER TABLE shootout_groups
  ADD COLUMN rolling_sessions_count INTEGER NOT NULL DEFAULT 14;
