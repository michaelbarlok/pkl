-- ============================================================
-- 075: Carry the display timezone on every sign-up sheet.
--
-- event_time, signup_closes_at and withdraw_closes_at are stored
-- in UTC (timestamptz), but the sheet needs a rendering zone so
-- server-rendered pages don't show Vercel's UTC clock. The zone
-- belongs to the event, not the viewer, so we snapshot it at
-- creation time.
--
-- Default is America/New_York to match the legacy group defaults.
-- The cron and the manual sheet-creation forms will populate it
-- from the group's recurring schedule when one exists.
-- ============================================================

ALTER TABLE signup_sheets
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/New_York';

-- Backfill existing rows from the group's recurring schedule when possible.
UPDATE signup_sheets s
   SET timezone = COALESCE(gs.timezone, 'America/New_York')
  FROM group_recurring_schedules gs
 WHERE gs.group_id = s.group_id
   AND s.timezone IS DISTINCT FROM COALESCE(gs.timezone, 'America/New_York');
