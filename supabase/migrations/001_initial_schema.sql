-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- PLAYERS
-- ============================================================
CREATE TABLE players (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  skill_rating NUMERIC(4, 2),
  role TEXT NOT NULL DEFAULT 'player' CHECK (role IN ('admin', 'player')),
  push_token TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players can view all players"
  ON players FOR SELECT USING (true);

CREATE POLICY "Players can update own profile"
  ON players FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Players can insert own profile"
  ON players FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- SESSIONS
-- ============================================================
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date DATE NOT NULL,
  location TEXT NOT NULL,
  max_players INTEGER NOT NULL DEFAULT 16,
  cutoff_time TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'upcoming'
    CHECK (status IN ('upcoming', 'active', 'completed', 'cancelled')),
  num_courts INTEGER NOT NULL DEFAULT 4,
  start_time TIMESTAMPTZ NOT NULL,
  notes TEXT,
  created_by UUID REFERENCES players(id) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view sessions"
  ON sessions FOR SELECT USING (true);

CREATE POLICY "Admins can manage sessions"
  ON sessions FOR ALL USING (
    EXISTS (SELECT 1 FROM players WHERE user_id = auth.uid() AND role = 'admin')
  );

-- ============================================================
-- SIGN_UPS
-- ============================================================
CREATE TABLE sign_ups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE NOT NULL,
  player_id UUID REFERENCES players(id) ON DELETE CASCADE NOT NULL,
  signed_up_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('confirmed', 'waitlist', 'withdrawn')),
  waitlist_position INTEGER,
  UNIQUE (session_id, player_id)
);

ALTER TABLE sign_ups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players can view sign_ups for their sessions"
  ON sign_ups FOR SELECT USING (true);

CREATE POLICY "Players can manage own sign_ups"
  ON sign_ups FOR ALL USING (
    player_id = (SELECT id FROM players WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM players WHERE user_id = auth.uid() AND role = 'admin')
  );

-- Function to handle sign-up with waitlist logic
CREATE OR REPLACE FUNCTION sign_up_for_session(p_session_id UUID, p_player_id UUID)
RETURNS sign_ups AS $$
DECLARE
  v_session sessions;
  v_confirmed_count INTEGER;
  v_signup sign_ups;
  v_status TEXT;
  v_waitlist_pos INTEGER;
BEGIN
  -- Get session details
  SELECT * INTO v_session FROM sessions WHERE id = p_session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found';
  END IF;

  IF v_session.status != 'upcoming' THEN
    RAISE EXCEPTION 'Session is not open for sign-ups';
  END IF;

  IF NOW() > v_session.cutoff_time THEN
    RAISE EXCEPTION 'Sign-up cutoff has passed';
  END IF;

  -- Count confirmed players
  SELECT COUNT(*) INTO v_confirmed_count
  FROM sign_ups
  WHERE session_id = p_session_id AND status = 'confirmed';

  IF v_confirmed_count < v_session.max_players THEN
    v_status := 'confirmed';
    v_waitlist_pos := NULL;
  ELSE
    v_status := 'waitlist';
    SELECT COALESCE(MAX(waitlist_position), 0) + 1 INTO v_waitlist_pos
    FROM sign_ups
    WHERE session_id = p_session_id AND status = 'waitlist';
  END IF;

  INSERT INTO sign_ups (session_id, player_id, status, waitlist_position)
  VALUES (p_session_id, p_player_id, v_status, v_waitlist_pos)
  RETURNING * INTO v_signup;

  RETURN v_signup;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to handle withdrawal and promote waitlist
CREATE OR REPLACE FUNCTION withdraw_from_session(p_session_id UUID, p_player_id UUID)
RETURNS VOID AS $$
DECLARE
  v_signup sign_ups;
  v_next_waitlist sign_ups;
BEGIN
  SELECT * INTO v_signup
  FROM sign_ups
  WHERE session_id = p_session_id AND player_id = p_player_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sign-up not found';
  END IF;

  UPDATE sign_ups SET status = 'withdrawn' WHERE id = v_signup.id;

  -- If the withdrawn player was confirmed, promote first waitlisted player
  IF v_signup.status = 'confirmed' THEN
    SELECT * INTO v_next_waitlist
    FROM sign_ups
    WHERE session_id = p_session_id AND status = 'waitlist'
    ORDER BY waitlist_position ASC
    LIMIT 1;

    IF FOUND THEN
      UPDATE sign_ups
      SET status = 'confirmed', waitlist_position = NULL
      WHERE id = v_next_waitlist.id;

      -- Reorder remaining waitlist
      UPDATE sign_ups
      SET waitlist_position = waitlist_position - 1
      WHERE session_id = p_session_id
        AND status = 'waitlist'
        AND waitlist_position > v_next_waitlist.waitlist_position;
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- COURTS
-- ============================================================
CREATE TABLE courts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE NOT NULL,
  court_number INTEGER NOT NULL,
  label TEXT NOT NULL,
  UNIQUE (session_id, court_number)
);

ALTER TABLE courts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view courts"
  ON courts FOR SELECT USING (true);

CREATE POLICY "Admins can manage courts"
  ON courts FOR ALL USING (
    EXISTS (SELECT 1 FROM players WHERE user_id = auth.uid() AND role = 'admin')
  );

-- ============================================================
-- ROUNDS
-- ============================================================
CREATE TABLE rounds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE NOT NULL,
  round_number INTEGER NOT NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  UNIQUE (session_id, round_number)
);

ALTER TABLE rounds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view rounds"
  ON rounds FOR SELECT USING (true);

CREATE POLICY "Admins can manage rounds"
  ON rounds FOR ALL USING (
    EXISTS (SELECT 1 FROM players WHERE user_id = auth.uid() AND role = 'admin')
  );

-- ============================================================
-- MATCHES
-- ============================================================
CREATE TABLE matches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  round_id UUID REFERENCES rounds(id) ON DELETE CASCADE NOT NULL,
  court_id UUID REFERENCES courts(id) NOT NULL,
  team1_player_ids UUID[] NOT NULL,
  team2_player_ids UUID[] NOT NULL,
  team1_score INTEGER,
  team2_score INTEGER,
  score_entered_by UUID REFERENCES players(id),
  score_entered_at TIMESTAMPTZ
);

ALTER TABLE matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view matches"
  ON matches FOR SELECT USING (true);

CREATE POLICY "Players can enter scores for their matches"
  ON matches FOR UPDATE USING (
    auth.uid() IN (
      SELECT user_id FROM players WHERE id = ANY(team1_player_ids || team2_player_ids)
    )
    OR EXISTS (SELECT 1 FROM players WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can insert matches"
  ON matches FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM players WHERE user_id = auth.uid() AND role = 'admin')
  );

-- ============================================================
-- PLAYER SESSION STATES
-- ============================================================
CREATE TABLE player_session_states (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE NOT NULL,
  player_id UUID REFERENCES players(id) ON DELETE CASCADE NOT NULL,
  current_court INTEGER NOT NULL DEFAULT 1,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  peak_court INTEGER,
  UNIQUE (session_id, player_id)
);

ALTER TABLE player_session_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view player session states"
  ON player_session_states FOR SELECT USING (true);

CREATE POLICY "Admins can manage player session states"
  ON player_session_states FOR ALL USING (
    EXISTS (SELECT 1 FROM players WHERE user_id = auth.uid() AND role = 'admin')
  );

-- ============================================================
-- ANNOUNCEMENTS
-- ============================================================
CREATE TABLE announcements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  league_id TEXT NOT NULL DEFAULT 'default',
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  type TEXT NOT NULL DEFAULT 'general'
    CHECK (type IN ('general', 'schedule_change', 'session_reminder', 'weather_cancellation')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_by UUID REFERENCES players(id) NOT NULL
);

ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view announcements"
  ON announcements FOR SELECT USING (true);

CREATE POLICY "Admins can create announcements"
  ON announcements FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM players WHERE user_id = auth.uid() AND role = 'admin')
  );

-- ============================================================
-- ALL-TIME STATS VIEW
-- ============================================================
CREATE OR REPLACE VIEW all_time_stats AS
SELECT
  p.id AS player_id,
  p.full_name,
  p.skill_rating,
  COALESCE(SUM(pss.wins), 0) AS total_wins,
  COALESCE(SUM(pss.losses), 0) AS total_losses,
  COUNT(DISTINCT pss.session_id) AS sessions_played,
  CASE
    WHEN COALESCE(SUM(pss.wins) + SUM(pss.losses), 0) = 0 THEN 0
    ELSE ROUND(SUM(pss.wins)::NUMERIC / (SUM(pss.wins) + SUM(pss.losses)), 4)
  END AS win_percentage,
  COALESCE(MIN(pss.peak_court), MIN(pss.current_court)) AS peak_court
FROM players p
LEFT JOIN player_session_states pss ON p.id = pss.player_id
GROUP BY p.id, p.full_name, p.skill_rating;

-- ============================================================
-- REALTIME
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE sign_ups;
ALTER PUBLICATION supabase_realtime ADD TABLE player_session_states;
ALTER PUBLICATION supabase_realtime ADD TABLE matches;
ALTER PUBLICATION supabase_realtime ADD TABLE rounds;
ALTER PUBLICATION supabase_realtime ADD TABLE announcements;

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_players_updated_at
  BEFORE UPDATE ON players
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_sessions_updated_at
  BEFORE UPDATE ON sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
