-- ============================================================
-- 073: Prevent duplicate sign-up sheets for the same group + event date.
--
-- The auto-post cron already checks for an existing sheet before
-- inserting, but with two cron invocations landing in the same window
-- the check-then-insert is not atomic. A unique index is the only way
-- to close that race deterministically.
--
-- Cancelled sheets are excluded so an admin can cancel and re-post on
-- the same date if needed.
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS signup_sheets_group_event_date_unique
  ON signup_sheets (group_id, event_date)
  WHERE status <> 'cancelled';
