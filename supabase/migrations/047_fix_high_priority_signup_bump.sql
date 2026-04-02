-- Fix safe_signup_for_sheet: use explicit boolean flag instead of FOUND
-- to track whether the bump succeeded, preventing the FOUND variable from
-- being reset by subsequent queries before the INSERT/UPDATE section.
--
-- Root cause: after the bump SELECT found a target, the two subsequent
-- UPDATEs (shift waitlist, move bumped player) both updated FOUND.
-- Then the withdrawn-record SELECT reset FOUND again before the final
-- IF FOUND check — so the INSERT used v_status='waitlist' even though
-- the bump had succeeded.

CREATE OR REPLACE FUNCTION safe_signup_for_sheet(
  p_sheet_id uuid,
  p_player_id uuid,
  p_priority text DEFAULT 'normal',
  p_registered_by uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sheet record;
  v_existing record;
  v_confirmed_count int;
  v_status text;
  v_waitlist_pos int;
  v_bump_target record;
  v_bumped_player_id uuid;
  v_reg_id uuid;
  v_bump_found boolean := false;  -- explicit flag, not reliant on FOUND
BEGIN
  -- Lock the sheet row to serialize all signups
  SELECT id, player_limit, status, signup_closes_at
  INTO v_sheet
  FROM signup_sheets
  WHERE id = p_sheet_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Sheet not found');
  END IF;

  IF v_sheet.status != 'open' THEN
    RETURN jsonb_build_object('error', 'Sheet is not open for sign-ups');
  END IF;

  IF v_sheet.signup_closes_at < now() THEN
    RETURN jsonb_build_object('error', 'Sign-up cutoff has passed');
  END IF;

  -- Check for existing active registration
  SELECT id, status INTO v_existing
  FROM registrations
  WHERE sheet_id = p_sheet_id AND player_id = p_player_id
    AND status IN ('confirmed', 'waitlist');

  IF FOUND THEN
    RETURN jsonb_build_object(
      'status', v_existing.status,
      'id', v_existing.id,
      'already_registered', true
    );
  END IF;

  -- Count confirmed players (safe under the sheet lock)
  SELECT count(*) INTO v_confirmed_count
  FROM registrations
  WHERE sheet_id = p_sheet_id AND status = 'confirmed';

  v_bumped_player_id := NULL;

  IF v_confirmed_count < v_sheet.player_limit THEN
    -- Room available — confirm regardless of priority
    v_status := 'confirmed';
    v_waitlist_pos := NULL;

  ELSIF p_priority = 'high' THEN
    -- Sheet is full and this is a high-priority signup.
    -- Try to bump the lowest-priority non-high confirmed player.
    -- Within the same priority tier, the most recent signup gets bumped.
    SELECT id, player_id INTO v_bump_target
    FROM registrations
    WHERE sheet_id = p_sheet_id
      AND status = 'confirmed'
      AND (priority IS NULL OR priority != 'high')
    ORDER BY
      CASE priority
        WHEN 'low' THEN 0
        WHEN 'normal' THEN 1
        ELSE 2
      END ASC,
      signed_up_at DESC
    LIMIT 1
    FOR UPDATE;

    -- Capture FOUND immediately before any other query can reset it
    v_bump_found := FOUND;

    IF v_bump_found THEN
      -- Shift all existing waitlist positions up by 1
      UPDATE registrations
      SET waitlist_position = waitlist_position + 1
      WHERE sheet_id = p_sheet_id AND status = 'waitlist';

      -- Move bumped player to waitlist position 1
      UPDATE registrations
      SET status = 'waitlist', waitlist_position = 1
      WHERE id = v_bump_target.id;

      v_bumped_player_id := v_bump_target.player_id;
      v_status := 'confirmed';
      v_waitlist_pos := NULL;
    ELSE
      -- All confirmed players are high priority — go to waitlist
      v_status := 'waitlist';
      SELECT coalesce(max(waitlist_position), 0) + 1 INTO v_waitlist_pos
      FROM registrations
      WHERE sheet_id = p_sheet_id AND status = 'waitlist';
    END IF;

  ELSE
    -- Sheet is full, normal/low priority — waitlist
    v_status := 'waitlist';
    SELECT coalesce(max(waitlist_position), 0) + 1 INTO v_waitlist_pos
    FROM registrations
    WHERE sheet_id = p_sheet_id AND status = 'waitlist';
  END IF;

  -- Insert or reactivate registration
  SELECT id INTO v_existing
  FROM registrations
  WHERE sheet_id = p_sheet_id AND player_id = p_player_id AND status = 'withdrawn';

  IF FOUND THEN
    UPDATE registrations
    SET status = v_status,
        priority = p_priority,
        waitlist_position = v_waitlist_pos,
        signed_up_at = now()
    WHERE id = v_existing.id;
    v_reg_id := v_existing.id;
  ELSE
    INSERT INTO registrations (sheet_id, player_id, status, priority, waitlist_position, signed_up_at, registered_by)
    VALUES (p_sheet_id, p_player_id, v_status, p_priority, v_waitlist_pos, now(), p_registered_by)
    RETURNING id INTO v_reg_id;
  END IF;

  RETURN jsonb_build_object(
    'status', v_status,
    'id', v_reg_id,
    'waitlist_position', v_waitlist_pos,
    'bumped_player_id', v_bumped_player_id
  );
END;
$$;
