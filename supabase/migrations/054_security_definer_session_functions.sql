-- ============================================================
-- Migration 054: SECURITY DEFINER on session completion functions
-- ============================================================
-- Both functions update session_participants and group_memberships.
-- Without SECURITY DEFINER they run under the calling user's RLS
-- context. If the admin JWT fails the RLS check, all step/court
-- updates silently no-op while the round still advances to
-- round_complete — leaving every player at their old step.
--
-- Making them SECURITY DEFINER gives them superuser-level write
-- access to the affected tables regardless of the caller, which
-- is the standard pattern for trusted admin-only RPCs.
-- ============================================================

CREATE OR REPLACE FUNCTION compute_target_courts(p_session_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_participant RECORD;
  v_num_courts INTEGER;
  v_target INTEGER;
BEGIN
  -- Look up how many courts this session uses
  SELECT num_courts INTO v_num_courts
  FROM shootout_sessions WHERE id = p_session_id;

  FOR v_participant IN
    SELECT sp.*,
      (SELECT COUNT(*) FROM session_participants sp2
       WHERE sp2.session_id = p_session_id AND sp2.court_number = sp.court_number) AS pool_size
    FROM session_participants sp
    WHERE sp.session_id = p_session_id
      AND sp.pool_finish IS NOT NULL
  LOOP
    -- 1st place: move up (lower court number = harder court)
    IF v_participant.pool_finish = 1 THEN
      v_target := v_participant.court_number - 1;
    -- Last place: move down
    ELSIF v_participant.pool_finish = v_participant.pool_size THEN
      v_target := v_participant.court_number + 1;
    -- Middle finishers: stay
    ELSE
      v_target := v_participant.court_number;
    END IF;

    -- Clamp between 1 and num_courts
    v_target := LEAST(v_num_courts, GREATEST(1, v_target));

    UPDATE session_participants
    SET target_court_next = v_target
    WHERE id = v_participant.id;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION update_steps_on_round_complete(p_session_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_participant RECORD;
  v_group_id UUID;
  v_prefs RECORD;
  v_new_step INTEGER;
BEGIN
  -- Get group_id from the session
  SELECT group_id INTO v_group_id
  FROM shootout_sessions WHERE id = p_session_id;

  -- Get group preferences (step_move_up, step_move_down, min_step, max_step)
  SELECT * INTO v_prefs
  FROM group_preferences WHERE group_id = v_group_id;

  FOR v_participant IN
    SELECT sp.*,
      (SELECT COUNT(*) FROM session_participants sp2
       WHERE sp2.session_id = p_session_id AND sp2.court_number = sp.court_number) AS pool_size
    FROM session_participants sp
    WHERE sp.session_id = p_session_id
      AND sp.pool_finish IS NOT NULL
  LOOP
    -- Start from this player's step at the beginning of the round
    v_new_step := v_participant.step_before;

    -- 1st place moves up (step decreases)
    IF v_participant.pool_finish = 1 THEN
      v_new_step := v_participant.step_before - v_prefs.step_move_up;
    -- Last place moves down (step increases)
    ELSIF v_participant.pool_finish = v_participant.pool_size THEN
      v_new_step := v_participant.step_before + v_prefs.step_move_down;
    -- Middle finishers: no change
    END IF;

    -- Clamp to group's configured range
    v_new_step := GREATEST(v_prefs.min_step, LEAST(v_prefs.max_step, v_new_step));

    -- Record the final step in the session participant row
    UPDATE session_participants
    SET step_after = v_new_step
    WHERE id = v_participant.id;

    -- Persist the new step + session stats to the group membership
    UPDATE group_memberships
    SET current_step = v_new_step,
        last_played_at = NOW(),
        total_sessions = total_sessions + 1
    WHERE group_id = v_group_id AND player_id = v_participant.player_id;
  END LOOP;

  -- Compute target courts for the next session
  PERFORM compute_target_courts(p_session_id);
END;
$$;
