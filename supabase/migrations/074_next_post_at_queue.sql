-- ============================================================
-- 074: next_post_at queue for sheet auto-posting
--
-- The time-matching auto-post cron is brittle: it requires the cron
-- run to land in the same 15-minute window as the configured post
-- time, does non-trivial timezone math on every invocation, and
-- cannot recover from a missed fire. Replace it with a precomputed
-- next_post_at column and a trigger that keeps it correct.
--
-- Changes:
--   * group_recurring_schedules.next_post_at TIMESTAMPTZ — the UTC
--     instant of the next due post. NULL when auto-post is disabled
--     (post_day_of_week or post_time is null) or the schedule is
--     inactive.
--   * compute_next_post_at(post_day, post_time, tz, after) — returns
--     the UTC instant of the first post_day-of-week + post_time that
--     occurs strictly after `after` in the given IANA timezone.
--   * bump_schedule_next_post_at(schedule_id) — advances next_post_at
--     to the next occurrence after the current next_post_at. Called
--     by the cron immediately after a successful sheet insert.
--   * set_next_post_at trigger — auto-populates next_post_at on
--     insert, and recomputes it when post_day_of_week, post_time,
--     timezone, or is_active changes.
--   * Backfill every existing row so the cron can start using the
--     queue immediately.
--
-- The cron's new query is simply:
--   WHERE is_active AND next_post_at IS NOT NULL AND next_post_at <= now()
-- which makes missed fires self-healing: next_post_at stays in the
-- past until a run catches it, and the post happens as soon as the
-- cron recovers.
-- ============================================================

ALTER TABLE group_recurring_schedules
  ADD COLUMN IF NOT EXISTS next_post_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS group_recurring_schedules_next_post_at_idx
  ON group_recurring_schedules (next_post_at)
  WHERE is_active AND next_post_at IS NOT NULL;

-- Resolves the next UTC timestamp at which (post_day, post_time) occurs
-- in the given IANA timezone, strictly AFTER p_after.
CREATE OR REPLACE FUNCTION compute_next_post_at(
  p_post_day int,
  p_post_time time,
  p_tz text,
  p_after timestamptz DEFAULT now()
) RETURNS timestamptz
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_tz text := COALESCE(p_tz, 'America/New_York');
  v_local_now timestamp;
  v_local_dow int;
  v_days_until int;
  v_target_local timestamp;
BEGIN
  IF p_post_day IS NULL OR p_post_time IS NULL THEN
    RETURN NULL;
  END IF;

  -- Current wall-clock in target zone (naive timestamp, zone stripped)
  v_local_now := (p_after AT TIME ZONE v_tz);
  v_local_dow := extract(dow FROM v_local_now)::int;

  v_days_until := (p_post_day - v_local_dow + 7) % 7;
  v_target_local := (v_local_now::date + v_days_until * interval '1 day') + p_post_time;

  -- If today is post day but time already passed, jump a week forward
  IF v_target_local <= v_local_now THEN
    v_target_local := v_target_local + interval '7 days';
  END IF;

  -- Reinterpret local wall-clock in target zone, convert back to UTC
  RETURN v_target_local AT TIME ZONE v_tz;
END;
$$;

-- Advance next_post_at after a successful post. Used by the cron.
CREATE OR REPLACE FUNCTION bump_schedule_next_post_at(p_schedule_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
AS $$
DECLARE
  v_row record;
  v_next timestamptz;
BEGIN
  SELECT post_day_of_week, post_time, timezone, next_post_at
  INTO v_row
  FROM group_recurring_schedules
  WHERE id = p_schedule_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Compute next occurrence strictly AFTER the current next_post_at
  -- (or now() if next_post_at is null). Adding 1 second guards against
  -- compute_next_post_at returning the same instant on boundary cases.
  v_next := compute_next_post_at(
    v_row.post_day_of_week,
    v_row.post_time,
    v_row.timezone,
    COALESCE(v_row.next_post_at, now()) + interval '1 second'
  );

  UPDATE group_recurring_schedules
     SET next_post_at = v_next
   WHERE id = p_schedule_id;

  RETURN v_next;
END;
$$;

-- Keep next_post_at in sync with the user's intent automatically.
CREATE OR REPLACE FUNCTION set_next_post_at_tg()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT NEW.is_active
     OR NEW.post_day_of_week IS NULL
     OR NEW.post_time IS NULL THEN
    NEW.next_post_at := NULL;
  ELSE
    NEW.next_post_at := compute_next_post_at(
      NEW.post_day_of_week,
      NEW.post_time,
      NEW.timezone
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_next_post_at ON group_recurring_schedules;
CREATE TRIGGER trg_set_next_post_at
  BEFORE INSERT OR UPDATE OF post_day_of_week, post_time, timezone, is_active
  ON group_recurring_schedules
  FOR EACH ROW
  EXECUTE FUNCTION set_next_post_at_tg();

-- Backfill existing rows so the cron can start reading from the queue.
UPDATE group_recurring_schedules
   SET next_post_at = CASE
     WHEN NOT is_active OR post_day_of_week IS NULL OR post_time IS NULL THEN NULL
     ELSE compute_next_post_at(post_day_of_week, post_time, timezone)
   END
 WHERE next_post_at IS DISTINCT FROM CASE
     WHEN NOT is_active OR post_day_of_week IS NULL OR post_time IS NULL THEN NULL
     ELSE compute_next_post_at(post_day_of_week, post_time, timezone)
   END;
