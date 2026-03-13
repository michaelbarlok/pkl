-- ============================================================
-- Migration 014: Tournaments
-- Adds tournaments, tournament_registrations, and tournament_matches tables
-- ============================================================

-- ============================================================
-- tournaments
-- ============================================================
CREATE TABLE tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL CHECK (char_length(title) <= 120),
  description TEXT CHECK (char_length(description) <= 5000),
  format TEXT NOT NULL CHECK (format IN ('single_elimination', 'double_elimination', 'round_robin')),
  type TEXT NOT NULL CHECK (type IN ('singles', 'doubles')),
  skill_level TEXT NOT NULL DEFAULT 'open' CHECK (skill_level IN ('open', 'beginner', 'intermediate', 'advanced')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  start_time TIME,
  location TEXT NOT NULL,
  player_cap INTEGER CHECK (player_cap IS NULL OR player_cap >= 2),
  entry_fee TEXT,
  registration_opens_at TIMESTAMPTZ,
  registration_closes_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'registration_open', 'registration_closed', 'in_progress', 'completed', 'cancelled')),
  created_by UUID REFERENCES profiles(id) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;

-- Anyone can view non-draft tournaments; creator can view own drafts
CREATE POLICY "View tournaments"
  ON tournaments FOR SELECT USING (
    status != 'draft'
    OR created_by = (SELECT id FROM profiles WHERE user_id = auth.uid())
  );

-- Any authenticated user can create tournaments
CREATE POLICY "Create tournaments"
  ON tournaments FOR INSERT WITH CHECK (
    created_by = (SELECT id FROM profiles WHERE user_id = auth.uid())
  );

-- Creator or site admin can update
CREATE POLICY "Update tournaments"
  ON tournaments FOR UPDATE USING (
    created_by = (SELECT id FROM profiles WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- Creator (draft only) or site admin can delete
CREATE POLICY "Delete tournaments"
  ON tournaments FOR DELETE USING (
    (created_by = (SELECT id FROM profiles WHERE user_id = auth.uid()) AND status = 'draft')
    OR EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE TRIGGER set_tournaments_updated_at
  BEFORE UPDATE ON tournaments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- tournament_registrations
-- ============================================================
CREATE TABLE tournament_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE NOT NULL,
  player_id UUID REFERENCES profiles(id) NOT NULL,
  partner_id UUID REFERENCES profiles(id),
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'waitlist', 'withdrawn')),
  waitlist_position INTEGER,
  seed INTEGER,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tournament_id, player_id)
);

ALTER TABLE tournament_registrations ENABLE ROW LEVEL SECURITY;

-- Anyone can view registrations
CREATE POLICY "View registrations"
  ON tournament_registrations FOR SELECT USING (true);

-- Self-registration
CREATE POLICY "Register self"
  ON tournament_registrations FOR INSERT WITH CHECK (
    player_id = (SELECT id FROM profiles WHERE user_id = auth.uid())
  );

-- Registrant (withdraw), tournament creator, or admin can update
CREATE POLICY "Update registrations"
  ON tournament_registrations FOR UPDATE USING (
    player_id = (SELECT id FROM profiles WHERE user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM tournaments t
      WHERE t.id = tournament_id
      AND t.created_by = (SELECT id FROM profiles WHERE user_id = auth.uid())
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- Tournament creator or admin can delete
CREATE POLICY "Delete registrations"
  ON tournament_registrations FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM tournaments t
      WHERE t.id = tournament_id
      AND t.created_by = (SELECT id FROM profiles WHERE user_id = auth.uid())
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- ============================================================
-- tournament_matches
-- ============================================================
CREATE TABLE tournament_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE NOT NULL,
  round INTEGER NOT NULL,
  match_number INTEGER NOT NULL,
  bracket TEXT NOT NULL DEFAULT 'winners' CHECK (bracket IN ('winners', 'losers', 'grand_final')),
  court TEXT,
  player1_id UUID REFERENCES profiles(id),
  player2_id UUID REFERENCES profiles(id),
  score1 INTEGER[] DEFAULT '{}',
  score2 INTEGER[] DEFAULT '{}',
  winner_id UUID REFERENCES profiles(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'bye')),
  scheduled_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE tournament_matches ENABLE ROW LEVEL SECURITY;

-- Anyone can view matches
CREATE POLICY "View matches"
  ON tournament_matches FOR SELECT USING (true);

-- Tournament creator or admin can manage matches
CREATE POLICY "Manage matches"
  ON tournament_matches FOR ALL USING (
    EXISTS (
      SELECT 1 FROM tournaments t
      WHERE t.id = tournament_id
      AND t.created_by = (SELECT id FROM profiles WHERE user_id = auth.uid())
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE TRIGGER set_tournament_matches_updated_at
  BEFORE UPDATE ON tournament_matches
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- Realtime
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE tournaments;
ALTER PUBLICATION supabase_realtime ADD TABLE tournament_registrations;
ALTER PUBLICATION supabase_realtime ADD TABLE tournament_matches;
