-- Let admins (site admin OR group admin) add players to a sheet even
-- after signup_closes_at / event_time. Before this, the RPC rejected
-- ANY signup past the cutoff regardless of caller role, which made it
-- impossible for a group admin to drop a last-minute substitute onto
-- the sheet once the window closed.
--
-- The route layer is still responsible for deciding WHO counts as an
-- admin — this function just accepts the boolean from the caller and
-- skips the cutoff check when set. All other validations (sheet
-- status, duplicate registration, bump logic, click-time ordering)
-- stay identical.
CREATE OR REPLACE FUNCTION safe_signup_for_sheet(
  p_sheet_id uuid,
  p_player_id uuid,
  p_priority text DEFAULT 'normal',
  p_registered_by uuid DEFAULT NULL,
  p_signed_up_at timestamptz DEFAULT NULL,
  p_bypass_closed boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sheet record;
  v_existing record;
  v_confirmed_count int;
  v_non_low_waitlisted int;
  v_status text;
  v_waitlist_pos int;
  v_bump_target record;
  v_bumped_player_id uuid;
  v_reg_id uuid;
  v_bump_found boolean := false;
  v_signed_up_at timestamptz;
BEGIN
  v_signed_up_at := coalesce(p_signed_up_at, now());

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

  -- Cutoff check is bypassed when the route passes p_bypass_closed.
  -- The route only sets that flag for authenticated admins.
  IF NOT p_bypass_closed AND v_sheet.signup_closes_at < now() THEN
    RETURN jsonb_build_object('error', 'Sign-up cutoff has passed');
  END IF;

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

  SELECT count(*) INTO v_confirmed_count
  FROM registrations
  WHERE sheet_id = p_sheet_id AND status = 'confirmed';

  v_bumped_player_id := NULL;

  IF p_priority = 'high' THEN
    IF v_confirmed_count < v_sheet.player_limit THEN
      v_status := 'confirmed';
      v_waitlist_pos := NULL;
    ELSE
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

      v_bump_found := FOUND;

      IF v_bump_found THEN
        UPDATE registrations
        SET waitlist_position = waitlist_position + 1
        WHERE sheet_id = p_sheet_id AND status = 'waitlist';

        UPDATE registrations
        SET status = 'waitlist', waitlist_position = 1
        WHERE id = v_bump_target.id;

        v_bumped_player_id := v_bump_target.player_id;
        v_status := 'confirmed';
        v_waitlist_pos := NULL;
      ELSE
        v_status := 'waitlist';
        SELECT coalesce(max(waitlist_position), 0) + 1 INTO v_waitlist_pos
        FROM registrations
        WHERE sheet_id = p_sheet_id AND status = 'waitlist';
      END IF;
    END IF;

  ELSIF p_priority = 'low' THEN
    SELECT count(*) INTO v_non_low_waitlisted
    FROM registrations
    WHERE sheet_id = p_sheet_id
      AND status = 'waitlist'
      AND (priority IS NULL OR priority != 'low');

    IF v_confirmed_count < v_sheet.player_limit AND v_non_low_waitlisted = 0 THEN
      v_status := 'confirmed';
      v_waitlist_pos := NULL;
    ELSE
      v_status := 'waitlist';
      SELECT coalesce(max(waitlist_position), 0) + 1 INTO v_waitlist_pos
      FROM registrations
      WHERE sheet_id = p_sheet_id AND status = 'waitlist';
    END IF;

  ELSE
    IF v_confirmed_count < v_sheet.player_limit THEN
      v_status := 'confirmed';
      v_waitlist_pos := NULL;
    ELSE
      SELECT id, player_id INTO v_bump_target
      FROM registrations
      WHERE sheet_id = p_sheet_id
        AND status = 'confirmed'
        AND priority = 'low'
      ORDER BY signed_up_at DESC
      LIMIT 1
      FOR UPDATE;

      v_bump_found := FOUND;

      IF v_bump_found THEN
        SELECT coalesce(max(waitlist_position), 0) + 1 INTO v_waitlist_pos
        FROM registrations
        WHERE sheet_id = p_sheet_id AND status = 'waitlist';

        UPDATE registrations
        SET status = 'waitlist', waitlist_position = v_waitlist_pos
        WHERE id = v_bump_target.id;

        v_bumped_player_id := v_bump_target.player_id;
        v_status := 'confirmed';
        v_waitlist_pos := NULL;
      ELSE
        v_status := 'waitlist';
        SELECT coalesce(max(waitlist_position), 0) + 1 INTO v_waitlist_pos
        FROM registrations
        WHERE sheet_id = p_sheet_id AND status = 'waitlist';
      END IF;
    END IF;
  END IF;

  SELECT id INTO v_existing
  FROM registrations
  WHERE sheet_id = p_sheet_id AND player_id = p_player_id AND status = 'withdrawn';

  IF FOUND THEN
    UPDATE registrations
    SET status = v_status,
        priority = p_priority,
        waitlist_position = v_waitlist_pos,
        signed_up_at = v_signed_up_at
    WHERE id = v_existing.id;
    v_reg_id := v_existing.id;
  ELSE
    INSERT INTO registrations (sheet_id, player_id, status, priority, waitlist_position, signed_up_at, registered_by)
    VALUES (p_sheet_id, p_player_id, v_status, p_priority, v_waitlist_pos, v_signed_up_at, p_registered_by)
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
