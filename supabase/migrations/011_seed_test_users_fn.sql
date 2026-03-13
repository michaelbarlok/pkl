-- Function to seed test users directly in the database (no HTTP calls)
-- Called via: serviceClient.rpc('seed_test_users', { p_sheet_id: '...', p_admin_id: '...' })
CREATE OR REPLACE FUNCTION seed_test_users(p_sheet_id UUID, p_admin_id UUID)
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
  v_sheet RECORD;
  v_name TEXT;
  v_first TEXT;
  v_last TEXT;
  v_email TEXT;
  v_auth_id UUID;
  v_profile_id UUID;
  v_confirmed_count INT;
  v_idx INT := 0;
  v_created INT := 0;
  v_confirmed INT := 0;
  v_waitlisted INT := 0;
BEGIN
  -- Verify sheet exists
  SELECT id, player_limit, group_id INTO v_sheet
  FROM signup_sheets WHERE id = p_sheet_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Sheet not found');
  END IF;

  -- Clean up existing test data
  DELETE FROM registrations WHERE player_id IN (
    SELECT id FROM profiles WHERE display_name LIKE '[TEST]%'
  );
  DELETE FROM group_memberships WHERE player_id IN (
    SELECT id FROM profiles WHERE display_name LIKE '[TEST]%'
  );

  -- Get auth user IDs before deleting profiles
  WITH deleted_profiles AS (
    DELETE FROM profiles WHERE display_name LIKE '[TEST]%'
    RETURNING user_id
  )
  DELETE FROM auth.users WHERE id IN (SELECT user_id FROM deleted_profiles WHERE user_id IS NOT NULL);

  -- Also clean up any orphaned test auth users
  DELETE FROM auth.users WHERE email LIKE 'test-%@test.local';

  -- Count existing confirmed registrations
  SELECT COUNT(*) INTO v_confirmed_count
  FROM registrations
  WHERE sheet_id = p_sheet_id AND status = 'confirmed';

  -- Create test users
  FOREACH v_name IN ARRAY v_names LOOP
    v_first := split_part(v_name, ' ', 1);
    v_last := split_part(v_name, ' ', 2);
    v_email := 'test-' || lower(v_first) || '-' || lower(v_last) || '@test.local';
    v_auth_id := gen_random_uuid();

    -- Insert into auth.users directly
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
      is_active, member_since, preferred_notify
    ) VALUES (
      v_auth_id,
      v_name,
      '[TEST] ' || v_name,
      v_email,
      'player',
      true,
      NOW(),
      ARRAY['email']
    ) RETURNING id INTO v_profile_id;

    -- Create group membership if sheet has a group
    IF v_sheet.group_id IS NOT NULL THEN
      INSERT INTO group_memberships (
        player_id, group_id, current_step, win_pct,
        total_sessions, last_played_at
      ) VALUES (
        v_profile_id,
        v_sheet.group_id,
        floor(random() * 6 + 1)::int,
        round((random() * 40 + 50)::numeric, 1),
        floor(random() * 20 + 1)::int,
        NOW() - (random() * interval '30 days')
      );
    END IF;

    -- Register on sheet
    IF v_confirmed_count < v_sheet.player_limit THEN
      INSERT INTO registrations (
        sheet_id, player_id, status, waitlist_position, registered_by
      ) VALUES (
        p_sheet_id, v_profile_id, 'confirmed', NULL, p_admin_id
      );
      v_confirmed_count := v_confirmed_count + 1;
      v_confirmed := v_confirmed + 1;
    ELSE
      v_waitlisted := v_waitlisted + 1;
      INSERT INTO registrations (
        sheet_id, player_id, status, waitlist_position, registered_by
      ) VALUES (
        p_sheet_id, v_profile_id, 'waitlist', v_waitlisted, p_admin_id
      );
    END IF;

    v_created := v_created + 1;
    v_idx := v_idx + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'created', v_created,
    'confirmed', v_confirmed,
    'waitlisted', v_waitlisted,
    'sheetId', p_sheet_id
  );
END;
$$;

-- Function to delete test users
CREATE OR REPLACE FUNCTION delete_test_users()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INT;
BEGIN
  -- Count before deleting
  SELECT COUNT(*) INTO v_count FROM profiles WHERE display_name LIKE '[TEST]%';

  IF v_count = 0 THEN
    RETURN jsonb_build_object('message', 'No test users found', 'deleted', 0);
  END IF;

  -- Delete registrations
  DELETE FROM registrations WHERE player_id IN (
    SELECT id FROM profiles WHERE display_name LIKE '[TEST]%'
  );

  -- Delete group memberships
  DELETE FROM group_memberships WHERE player_id IN (
    SELECT id FROM profiles WHERE display_name LIKE '[TEST]%'
  );

  -- Delete profiles and auth users
  WITH deleted_profiles AS (
    DELETE FROM profiles WHERE display_name LIKE '[TEST]%'
    RETURNING user_id
  )
  DELETE FROM auth.users WHERE id IN (SELECT user_id FROM deleted_profiles WHERE user_id IS NOT NULL);

  -- Clean up orphaned test auth users
  DELETE FROM auth.users WHERE email LIKE 'test-%@test.local';

  RETURN jsonb_build_object('success', true, 'deleted', v_count);
END;
$$;
