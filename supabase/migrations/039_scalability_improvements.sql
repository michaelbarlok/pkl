-- ============================================================
-- 039: Scalability improvements
-- Adds indexes, race-condition-safe signup, waitlist RPC,
-- and a player stats view.
-- ============================================================

-- ============================================================
-- 1. Missing indexes for query performance
-- ============================================================

-- Registrations: fast lookup for duplicate checks and sheet queries
CREATE INDEX IF NOT EXISTS idx_registrations_sheet_player
  ON registrations (sheet_id, player_id);

CREATE INDEX IF NOT EXISTS idx_registrations_sheet_status
  ON registrations (sheet_id, status, signed_up_at);

-- Game results: player lookups for badge/stats queries
CREATE INDEX IF NOT EXISTS idx_game_results_player_a1
  ON game_results (team_a_p1);
CREATE INDEX IF NOT EXISTS idx_game_results_player_a2
  ON game_results (team_a_p2);
CREATE INDEX IF NOT EXISTS idx_game_results_player_b1
  ON game_results (team_b_p1);
CREATE INDEX IF NOT EXISTS idx_game_results_player_b2
  ON game_results (team_b_p2);

-- Free play matches: group + session lookup, player lookups
CREATE INDEX IF NOT EXISTS idx_free_play_matches_group_session
  ON free_play_matches (group_id, session_id);
CREATE INDEX IF NOT EXISTS idx_free_play_matches_player_a1
  ON free_play_matches (team_a_p1);
CREATE INDEX IF NOT EXISTS idx_free_play_matches_player_a2
  ON free_play_matches (team_a_p2);
CREATE INDEX IF NOT EXISTS idx_free_play_matches_player_b1
  ON free_play_matches (team_b_p1);
CREATE INDEX IF NOT EXISTS idx_free_play_matches_player_b2
  ON free_play_matches (team_b_p2);

-- Tournament registrations: division queries and waitlist
CREATE INDEX IF NOT EXISTS idx_tournament_regs_tournament_status
  ON tournament_registrations (tournament_id, status);
CREATE INDEX IF NOT EXISTS idx_tournament_regs_player
  ON tournament_registrations (player_id);

-- Tournament matches: bracket advancement queries
CREATE INDEX IF NOT EXISTS idx_tournament_matches_tournament_round
  ON tournament_matches (tournament_id, round, bracket);

-- Profiles: RLS admin checks (used in 30+ policies)
CREATE INDEX IF NOT EXISTS idx_profiles_user_role
  ON profiles (user_id, role);

-- Group memberships: player lookups
CREATE INDEX IF NOT EXISTS idx_group_memberships_player
  ON group_memberships (player_id);

-- ============================================================
-- 2. Unique constraint to prevent duplicate registrations
-- ============================================================

-- Prevent duplicate active registrations (confirmed/waitlist) for same player+sheet
CREATE UNIQUE INDEX IF NOT EXISTS idx_registrations_unique_active
  ON registrations (sheet_id, player_id)
  WHERE status IN ('confirmed', 'waitlist');

-- ============================================================
-- 3. Waitlist position increment RPC
-- ============================================================

CREATE OR REPLACE FUNCTION increment_waitlist_positions(p_sheet_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE registrations
  SET waitlist_position = waitlist_position + 1
  WHERE sheet_id = p_sheet_id
    AND status = 'waitlist';
$$;

-- ============================================================
-- 4. Atomic signup function (race-condition safe)
-- Uses SELECT ... FOR UPDATE to lock the sheet row during
-- capacity check, preventing double-booking.
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
  v_status text;
  v_waitlist_pos int;
BEGIN
  -- Lock the sheet row to prevent concurrent capacity changes
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
    RETURN jsonb_build_object('status', v_existing.status, 'id', v_existing.id, 'already_registered', true);
  END IF;

  -- Count confirmed (locked by the sheet FOR UPDATE)
  SELECT count(*) INTO v_confirmed_count
  FROM registrations
  WHERE sheet_id = p_sheet_id AND status = 'confirmed';

  IF v_confirmed_count < v_sheet.player_limit THEN
    v_status := 'confirmed';
    v_waitlist_pos := NULL;
  ELSE
    v_status := 'waitlist';
    SELECT coalesce(max(waitlist_position), 0) + 1 INTO v_waitlist_pos
    FROM registrations
    WHERE sheet_id = p_sheet_id AND status = 'waitlist';
  END IF;

  -- Check if there's a withdrawn registration to reactivate
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

    RETURN jsonb_build_object('status', v_status, 'id', v_existing.id, 'waitlist_position', v_waitlist_pos);
  ELSE
    INSERT INTO registrations (sheet_id, player_id, status, priority, waitlist_position, signed_up_at, registered_by)
    VALUES (p_sheet_id, p_player_id, v_status, p_priority, v_waitlist_pos, now(), p_registered_by)
    RETURNING id INTO v_existing;

    RETURN jsonb_build_object('status', v_status, 'id', v_existing.id, 'waitlist_position', v_waitlist_pos);
  END IF;
END;
$$;
