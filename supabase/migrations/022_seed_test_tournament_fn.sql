-- ============================================================
-- Migration 022: Seed Test Tournament Function
-- Creates test users and registers them for a tournament
-- Called via: serviceClient.rpc('seed_test_tournament', { p_tournament_id: '...', p_count: 8 })
-- ============================================================

CREATE OR REPLACE FUNCTION seed_test_tournament(
  p_tournament_id UUID,
  p_count INT DEFAULT 8
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_names TEXT[] := ARRAY[
    'Alex Smith', 'Jordan Johnson', 'Taylor Williams', 'Casey Brown', 'Morgan Jones',
    'Riley Garcia', 'Quinn Miller', 'Avery Davis', 'Cameron Rodriguez', 'Drew Martinez',
    'Finley Anderson', 'Harper Thomas', 'Hayden Jackson', 'Jesse White', 'Kai Harris',
    'Lane Martin', 'Micah Thompson', 'Noel Moore', 'Parker Young', 'Peyton Allen',
    'Reese King', 'River Wright', 'Rowan Scott', 'Sage Torres', 'Skyler Hill',
    'Blake Green', 'Charlie Adams', 'Dakota Baker', 'Emerson Nelson', 'Frankie Carter',
    'Gray Mitchell', 'Harley Perez', 'Jaden Roberts', 'Kendall Turner', 'Logan Phillips',
    'Mackenzie Campbell', 'Oakley Parker', 'Phoenix Evans', 'Spencer Edwards'
  ];
  v_tournament RECORD;
  v_name TEXT;
  v_first TEXT;
  v_last TEXT;
  v_email TEXT;
  v_auth_id UUID;
  v_profile_id UUID;
  v_division TEXT;
  v_divisions TEXT[];
  v_idx INT := 0;
  v_created INT := 0;
  v_confirmed INT := 0;
  v_confirmed_count INT;
BEGIN
  -- Verify tournament exists
  SELECT id, player_cap, divisions, status INTO v_tournament
  FROM tournaments WHERE id = p_tournament_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Tournament not found');
  END IF;

  -- Get divisions array
  v_divisions := v_tournament.divisions;

  -- Cap count at array length
  IF p_count > array_length(v_names, 1) THEN
    p_count := array_length(v_names, 1);
  END IF;

  -- Count existing confirmed registrations
  SELECT COUNT(*) INTO v_confirmed_count
  FROM tournament_registrations
  WHERE tournament_id = p_tournament_id AND status = 'confirmed';

  -- Create test users and register them
  FOREACH v_name IN ARRAY v_names LOOP
    EXIT WHEN v_idx >= p_count;

    v_first := split_part(v_name, ' ', 1);
    v_last := split_part(v_name, ' ', 2);
    v_email := 'test-tourney-' || lower(v_first) || '-' || lower(v_last) || '@test.local';
    v_auth_id := gen_random_uuid();

    -- Pick a division (cycle through available divisions)
    IF array_length(v_divisions, 1) > 0 THEN
      v_division := v_divisions[(v_idx % array_length(v_divisions, 1)) + 1];
    ELSE
      v_division := NULL;
    END IF;

    -- Check if this test user already exists
    IF EXISTS (SELECT 1 FROM auth.users WHERE email = v_email) THEN
      v_idx := v_idx + 1;
      CONTINUE;
    END IF;

    -- Insert into auth.users
    INSERT INTO auth.users (
      id, instance_id, aud, role, email,
      encrypted_password, email_confirmed_at,
      created_at, updated_at, confirmation_token,
      raw_app_meta_data, raw_user_meta_data
    ) VALUES (
      v_auth_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      v_email,
      crypt('testpassword123', gen_salt('bf')),
      NOW(),
      NOW(),
      NOW(),
      '',
      jsonb_build_object('provider', 'email', 'providers', ARRAY['email']),
      jsonb_build_object('full_name', v_name)
    );

    -- Insert profile
    INSERT INTO profiles (
      user_id, full_name, display_name, email, role,
      skill_level, is_active, member_since, preferred_notify
    ) VALUES (
      v_auth_id,
      v_name,
      '[TEST] ' || v_name,
      v_email,
      'player',
      (ARRAY[3.0, 3.5, 4.0, 4.5])[floor(random() * 4 + 1)::int],
      true,
      NOW(),
      ARRAY['email']
    ) RETURNING id INTO v_profile_id;

    -- Register for tournament
    IF v_tournament.player_cap IS NULL OR v_confirmed_count < v_tournament.player_cap THEN
      INSERT INTO tournament_registrations (
        tournament_id, player_id, division, status
      ) VALUES (
        p_tournament_id, v_profile_id, v_division, 'confirmed'
      );
      v_confirmed_count := v_confirmed_count + 1;
      v_confirmed := v_confirmed + 1;
    ELSE
      INSERT INTO tournament_registrations (
        tournament_id, player_id, division, status, waitlist_position
      ) VALUES (
        p_tournament_id, v_profile_id, v_division, 'waitlist',
        (SELECT COALESCE(MAX(waitlist_position), 0) + 1
         FROM tournament_registrations
         WHERE tournament_id = p_tournament_id AND status = 'waitlist')
      );
    END IF;

    v_created := v_created + 1;
    v_idx := v_idx + 1;
  END LOOP;

  -- If tournament is still in draft, open registration
  IF v_tournament.status = 'draft' THEN
    UPDATE tournaments SET status = 'registration_open' WHERE id = p_tournament_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'created', v_created,
    'confirmed', v_confirmed,
    'tournament_id', p_tournament_id
  );
END;
$$;

-- Cleanup function: remove test tournament registrations and users
CREATE OR REPLACE FUNCTION delete_test_tournament_users()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM profiles WHERE email LIKE 'test-tourney-%@test.local';

  IF v_count = 0 THEN
    RETURN jsonb_build_object('message', 'No test tournament users found', 'deleted', 0);
  END IF;

  -- Delete tournament registrations
  DELETE FROM tournament_registrations WHERE player_id IN (
    SELECT id FROM profiles WHERE email LIKE 'test-tourney-%@test.local'
  );

  -- Delete profiles and auth users
  WITH deleted_profiles AS (
    DELETE FROM profiles WHERE email LIKE 'test-tourney-%@test.local'
    RETURNING user_id
  )
  DELETE FROM auth.users WHERE id IN (SELECT user_id FROM deleted_profiles WHERE user_id IS NOT NULL);

  DELETE FROM auth.users WHERE email LIKE 'test-tourney-%@test.local';

  RETURN jsonb_build_object('success', true, 'deleted', v_count);
END;
$$;
