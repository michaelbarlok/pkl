-- Extend group_recurring_schedules with explicit timezone and posting schedule.
-- The "Play Time" is when the ladder league meets; the posting schedule is when
-- the sign-up sheet gets automatically published to the group.

ALTER TABLE group_recurring_schedules
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/New_York',
  ADD COLUMN IF NOT EXISTS post_day_of_week SMALLINT CHECK (post_day_of_week BETWEEN 0 AND 6),
  ADD COLUMN IF NOT EXISTS post_time TIME;

-- Make signup_opens_days_before nullable — it's superseded by the explicit
-- post_day_of_week / post_time when both are set.
ALTER TABLE group_recurring_schedules
  ALTER COLUMN signup_opens_days_before DROP NOT NULL,
  ALTER COLUMN signup_opens_days_before SET DEFAULT NULL;
