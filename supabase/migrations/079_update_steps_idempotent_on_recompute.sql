-- Make update_steps_on_round_complete idempotent when re-run after a score
-- edit on a round_complete / session_complete session.
--
-- Previous behavior:
--   - On every invocation, bumped total_sessions by 1 and set last_played_at
--     to NOW(). Editing a score after the round completed therefore
--     inflated the player's session count and reset their "last played"
--     timestamp to the edit time.
--   - On every invocation, overwrote group_memberships.current_step with
--     v_new_step regardless of whether the player had played newer sessions
--     since — so correcting an older session's score would wipe out the
--     step changes from any later sessions.
--
-- New behavior:
--   - First run for a participant (`step_after IS NULL`) behaves exactly
--     as before — bump total_sessions, set last_played_at, set
--     current_step.
--   - Re-runs (`step_after IS NOT NULL`) update `step_after` on the
--     session row, but only adjust `current_step` on group_memberships if
--     the membership's current_step still equals the previous
--     step_after — i.e., nothing since this session has moved it.
--     total_sessions and last_played_at are never touched on re-run.

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
  v_was_first_time BOOLEAN;
  v_previous_step_after INTEGER;
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
    v_was_first_time := v_participant.step_after IS NULL;
    v_previous_step_after := v_participant.step_after;

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

    -- Always keep the session row's step_after in sync with the current score.
    UPDATE session_participants
    SET step_after = v_new_step
    WHERE id = v_participant.id;

    IF v_was_first_time THEN
      -- First completion: normal bookkeeping.
      UPDATE group_memberships
      SET current_step = v_new_step,
          last_played_at = NOW(),
          total_sessions = total_sessions + 1
      WHERE group_id = v_group_id AND player_id = v_participant.player_id;
    ELSE
      -- Re-run after a score edit: only adjust current_step if nothing
      -- has happened since this session that already moved it. Leaves
      -- total_sessions and last_played_at alone so edits are idempotent.
      UPDATE group_memberships
      SET current_step = v_new_step
      WHERE group_id = v_group_id
        AND player_id = v_participant.player_id
        AND current_step = v_previous_step_after;
    END IF;
  END LOOP;

  -- Compute target courts for the next session (same as before)
  PERFORM compute_target_courts(p_session_id);
END;
$$;
