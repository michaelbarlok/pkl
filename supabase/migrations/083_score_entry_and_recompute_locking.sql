-- Close the last two concurrency gaps in ladder score entry and
-- per-round recompute:
--
-- 1) Duplicate-score race. Two teammates on the same court tapping
--    "Submit" within ~200ms could both pass the dup-check in the API
--    route before either INSERT landed, and both would succeed. We
--    add a DB-level unique expression index over a canonical matchup
--    key (partner order and team order don't matter) so the second
--    insert now fails with 23505 and the API route returns the usual
--    409. The check-then-insert in the route stays as a fast path;
--    the index is the correctness backstop.
--
-- 2) Concurrent recompute. update_steps_on_round_complete could be
--    invoked twice in parallel for the same session (admin double-
--    click, or complete-round + edit-score recompute racing). Each
--    call reads session_participants.step_after, decides "first time
--    vs re-run", and writes group_memberships — two concurrent "first
--    time" decisions double-bumped total_sessions. A session-scoped
--    advisory transaction lock at the top of the function now
--    serializes these so only one runs at a time per session.

-- -------- 1. Canonical matchup key function ----------------------
-- Immutable + parallel-safe so Postgres can use it in an expression
-- index. Players within a team are sorted (so (p1, p2) == (p2, p1)),
-- and the two team strings are sorted (so "A vs B" == "B vs A"). The
-- function is kept as a single self-contained SQL body to avoid the
-- inlining ordering issue that hits you when one SQL function calls
-- another during index creation.
CREATE OR REPLACE FUNCTION canonical_matchup(a1 uuid, a2 uuid, b1 uuid, b2 uuid)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT
    LEAST(
      LEAST(a1::text, COALESCE(a2::text, a1::text)) || '-' ||
      GREATEST(a1::text, COALESCE(a2::text, a1::text)),
      LEAST(b1::text, COALESCE(b2::text, b1::text)) || '-' ||
      GREATEST(b1::text, COALESCE(b2::text, b1::text))
    ) || '|' ||
    GREATEST(
      LEAST(a1::text, COALESCE(a2::text, a1::text)) || '-' ||
      GREATEST(a1::text, COALESCE(a2::text, a1::text)),
      LEAST(b1::text, COALESCE(b2::text, b1::text)) || '-' ||
      GREATEST(b1::text, COALESCE(b2::text, b1::text))
    )
$$;

-- One game_results row per (session, round, pool, matchup). Any
-- concurrent second insert gets a unique_violation (SQLSTATE 23505)
-- which the API route surfaces as 409 "already exists".
CREATE UNIQUE INDEX IF NOT EXISTS uniq_game_results_matchup
  ON game_results (
    session_id,
    round_number,
    pool_number,
    canonical_matchup(team_a_p1, team_a_p2, team_b_p1, team_b_p2)
  );

-- -------- 2. Serialize concurrent recomputes ----------------------
-- Keep everything else from 079 exactly as-is. The only change is the
-- advisory-xact-lock at the top: concurrent callers for the same
-- session queue up instead of racing on the step_after read and
-- total_sessions bump.
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
  -- Advisory lock scoped to this transaction. hashtextextended gives a
  -- stable bigint from the session UUID; two concurrent calls for the
  -- same session_id land on the same key and serialize.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_session_id::text, 0));

  SELECT group_id INTO v_group_id
  FROM shootout_sessions WHERE id = p_session_id;

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

    v_new_step := v_participant.step_before;

    IF v_participant.pool_finish = 1 THEN
      v_new_step := v_participant.step_before - v_prefs.step_move_up;
    ELSIF v_participant.pool_finish = v_participant.pool_size THEN
      v_new_step := v_participant.step_before + v_prefs.step_move_down;
    END IF;

    v_new_step := GREATEST(v_prefs.min_step, LEAST(v_prefs.max_step, v_new_step));

    UPDATE session_participants
    SET step_after = v_new_step
    WHERE id = v_participant.id;

    IF v_was_first_time THEN
      UPDATE group_memberships
      SET current_step = v_new_step,
          last_played_at = NOW(),
          total_sessions = total_sessions + 1
      WHERE group_id = v_group_id AND player_id = v_participant.player_id;
    ELSE
      UPDATE group_memberships
      SET current_step = v_new_step
      WHERE group_id = v_group_id
        AND player_id = v_participant.player_id
        AND current_step = v_previous_step_after;
    END IF;
  END LOOP;

  PERFORM compute_target_courts(p_session_id);
END;
$$;
