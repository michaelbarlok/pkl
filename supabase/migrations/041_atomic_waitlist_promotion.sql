-- ============================================================
-- 041: Atomic waitlist promotion
-- Replaces the multi-step promote-and-reorder logic with a
-- single transactional function to prevent race conditions
-- when multiple players withdraw concurrently.
-- ============================================================

CREATE OR REPLACE FUNCTION promote_next_waitlist_player(p_sheet_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_next record;
  v_remaining record;
  v_pos int;
BEGIN
  -- Lock the sheet row to serialize concurrent promotions
  PERFORM id FROM signup_sheets WHERE id = p_sheet_id FOR UPDATE;

  -- Find the highest-priority waitlisted player
  -- Priority order: high (2) > normal (1) > low (0)
  -- Within same priority, lowest waitlist_position wins
  SELECT id, player_id INTO v_next
  FROM registrations
  WHERE sheet_id = p_sheet_id AND status = 'waitlist'
  ORDER BY
    CASE priority
      WHEN 'high' THEN 0
      WHEN 'normal' THEN 1
      WHEN 'low' THEN 2
      ELSE 1
    END ASC,
    waitlist_position ASC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('promoted', false);
  END IF;

  -- Promote to confirmed
  UPDATE registrations
  SET status = 'confirmed', waitlist_position = NULL
  WHERE id = v_next.id;

  -- Reorder remaining waitlist positions in a single UPDATE
  -- using a subquery to assign sequential positions
  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY waitlist_position ASC) AS new_pos
    FROM registrations
    WHERE sheet_id = p_sheet_id AND status = 'waitlist'
  )
  UPDATE registrations r
  SET waitlist_position = ranked.new_pos
  FROM ranked
  WHERE r.id = ranked.id;

  RETURN jsonb_build_object(
    'promoted', true,
    'player_id', v_next.player_id,
    'registration_id', v_next.id
  );
END;
$$;
