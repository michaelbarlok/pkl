-- ============================================================
-- 072: Enforce low-priority-always-last rule in safe_signup_for_sheet.
--
-- Before:
--   * Low-priority players could grab a confirmed slot whenever the sheet
--     had room — which under concurrent signups let them race ahead of a
--     normal-priority player whose request arrived microseconds later.
--   * Normal-priority signups to a full sheet always went to the waitlist
--     — even if a confirmed 'low' player was sitting in a slot they
--     shouldn't have taken.
--
-- After:
--   * Low-priority signups only land as confirmed when the sheet has room
--     AND no non-low player is already on the waitlist. Otherwise they go
--     to the end of the waitlist.
--   * Normal-priority signups to a full sheet bump the most-recent
--     confirmed 'low' (if any) to the end of the waitlist, then take
--     their slot. If no confirmed low exists, fall back to waitlisting
--     as before.
--   * High-priority bump behavior is unchanged: bumps the lowest-priority
--     non-high confirmed player and shifts the waitlist up by 1.
--
-- Invariant produced: the confirmed list never contains a low-priority
-- player while there is a non-low player on the waitlist.
-- ============================================================

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
  v_non_low_waitlisted int;
  v_status text;
  v_waitlist_pos int;
  v_bump_target record;
  v_bumped_player_id uuid;
  v_reg_id uuid;
  v_bump_found boolean := false;
BEGIN
  -- Lock the sheet row to serialize all signups for this sheet
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

  -- Already registered (active) — return current status without changes
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
    -- High-priority path (unchanged from 047).
    IF v_confirmed_count < v_sheet.player_limit THEN
      v_status := 'confirmed';
      v_waitlist_pos := NULL;
    ELSE
      -- Bump the lowest-priority non-high confirmed player. Within a tier,
      -- most-recent signup gets bumped. Bumped player goes to waitlist pos 1,
      -- existing waitlist shifts up by 1.
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
        -- Every confirmed is high priority already — go to waitlist
        v_status := 'waitlist';
        SELECT coalesce(max(waitlist_position), 0) + 1 INTO v_waitlist_pos
        FROM registrations
        WHERE sheet_id = p_sheet_id AND status = 'waitlist';
      END IF;
    END IF;

  ELSIF p_priority = 'low' THEN
    -- Low-priority path: confirm ONLY when sheet has room AND no non-low
    -- players are on the waitlist. This preserves the invariant that low
    -- never sits in a confirmed slot ahead of a waiting normal/high.
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
    -- Normal-priority path.
    IF v_confirmed_count < v_sheet.player_limit THEN
      v_status := 'confirmed';
      v_waitlist_pos := NULL;
    ELSE
      -- Sheet full. Bump the most-recent confirmed 'low' (if any). The bumped
      -- low goes to the END of the waitlist — a bumped low must never sit
      -- ahead of a waitlisted normal.
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
        -- No confirmed low to bump — go to waitlist
        v_status := 'waitlist';
        SELECT coalesce(max(waitlist_position), 0) + 1 INTO v_waitlist_pos
        FROM registrations
        WHERE sheet_id = p_sheet_id AND status = 'waitlist';
      END IF;
    END IF;
  END IF;

  -- Insert new row, or reactivate a prior 'withdrawn' registration
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
