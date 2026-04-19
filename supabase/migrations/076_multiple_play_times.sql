-- ============================================================
-- 076: Multiple play times per group.
--
-- Groups that play more than once a week (e.g. Tuesday morning +
-- Friday evening league) need an entry per play time, each with its
-- own auto-post schedule. The single-row-per-group constraint was
-- blocking that.
--
-- Changes:
--   * Drop group_recurring_schedules_one_per_group so a group can
--     have any number of active schedules.
--   * Add an optional label ("Tuesday morning", "Friday league")
--     for the admin UI to identify each entry.
--   * Replace the (group_id, event_date) partial unique index on
--     signup_sheets with (group_id, event_date, event_time). Two
--     play times on the same day have distinct event_time, so the
--     cron can insert one sheet per play time without colliding.
-- ============================================================

DROP INDEX IF EXISTS group_recurring_schedules_one_per_group;

ALTER TABLE group_recurring_schedules
  ADD COLUMN IF NOT EXISTS label TEXT;

CREATE INDEX IF NOT EXISTS group_recurring_schedules_group_idx
  ON group_recurring_schedules (group_id);

DROP INDEX IF EXISTS signup_sheets_group_event_date_unique;
CREATE UNIQUE INDEX IF NOT EXISTS signup_sheets_group_event_datetime_unique
  ON signup_sheets (group_id, event_date, event_time)
  WHERE status <> 'cancelled';
