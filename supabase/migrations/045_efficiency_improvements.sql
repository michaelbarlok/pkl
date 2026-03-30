-- ============================================================
-- 045: Efficiency improvements
-- Batch waitlist reorder RPCs and missing index
-- ============================================================

-- ============================================================
-- 1. Missing index
-- ============================================================

-- forum_threads: badge query for post count
-- (free_play_matches has no status column; group_id+session_id index
--  already exists from migration 039)
CREATE INDEX IF NOT EXISTS idx_forum_threads_author
  ON forum_threads (author_id);

-- ============================================================
-- 2. Batch reorder functions (replace sequential per-row updates)
-- ============================================================

-- Reorder tournament waitlist in a single UPDATE (via CTE) instead of
-- one UPDATE per row in application code.
CREATE OR REPLACE FUNCTION reorder_tournament_waitlist(
  p_tournament_id uuid,
  p_division text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (ORDER BY waitlist_position NULLS LAST) AS new_pos
    FROM tournament_registrations
    WHERE tournament_id = p_tournament_id
      AND status = 'waitlist'
      AND (p_division IS NULL OR division = p_division)
  )
  UPDATE tournament_registrations
  SET waitlist_position = ranked.new_pos
  FROM ranked
  WHERE tournament_registrations.id = ranked.id;
END;
$$;

-- Reorder sheet waitlist in a single UPDATE (via CTE) instead of
-- one UPDATE per row in application code.
CREATE OR REPLACE FUNCTION reorder_sheet_waitlist(
  p_sheet_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (ORDER BY waitlist_position NULLS LAST) AS new_pos
    FROM registrations
    WHERE sheet_id = p_sheet_id
      AND status = 'waitlist'
  )
  UPDATE registrations
  SET waitlist_position = ranked.new_pos
  FROM ranked
  WHERE registrations.id = ranked.id;
END;
$$;
