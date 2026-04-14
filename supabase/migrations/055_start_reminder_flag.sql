-- ============================================================
-- Migration 055: 24-hour event start reminder flag
-- Adds a flag column so the start-reminder cron fires exactly
-- once per sheet, matching the pattern of signup_reminder_sent
-- and withdraw_reminder_sent.
-- ============================================================

ALTER TABLE signup_sheets
  ADD COLUMN IF NOT EXISTS start_reminder_sent BOOLEAN NOT NULL DEFAULT false;
