-- ============================================================
-- 038: Achievement Badges
-- ============================================================

-- Badge definitions (static catalog of all badges)
CREATE TABLE badge_definitions (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('play', 'winning', 'rating', 'community', 'tournament', 'ladder')),
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Player badges (earned badges junction table)
CREATE TABLE player_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  badge_code TEXT NOT NULL REFERENCES badge_definitions(code) ON DELETE CASCADE,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(player_id, badge_code)
);

-- Indexes
CREATE INDEX idx_player_badges_player ON player_badges(player_id);
CREATE INDEX idx_player_badges_code ON player_badges(badge_code);

-- RLS
ALTER TABLE badge_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view badge definitions"
  ON badge_definitions FOR SELECT USING (true);

CREATE POLICY "Anyone can view player badges"
  ON player_badges FOR SELECT USING (true);

-- Only admins (or service role) can insert/manage badges
CREATE POLICY "Admins can manage player badges"
  ON player_badges FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can delete player badges"
  ON player_badges FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- Seed badge definitions
INSERT INTO badge_definitions (code, name, description, category, sort_order) VALUES
  -- Play milestones
  ('first_game',   'First Rally',    'Play your first game',  'play', 1),
  ('games_10',     'Getting Started', 'Play 10 games',        'play', 2),
  ('games_50',     'Regular',         'Play 50 games',        'play', 3),
  ('games_100',    'Centurion',       'Play 100 games',       'play', 4),
  ('games_500',    'Veteran',         'Play 500 games',       'play', 5),
  -- Winning
  ('first_win',    'First Victory',    'Win your first game',       'winning', 10),
  ('wins_10',      'On a Roll',        'Win 10 games',              'winning', 11),
  ('wins_50',      'Dominant',         'Win 50 games',              'winning', 12),
  ('win_streak_3', 'Hot Streak',       'Win 3 games in a row',      'winning', 13),
  ('win_streak_5', 'Unstoppable',      'Win 5 games in a row',      'winning', 14),
  ('win_streak_10','Legendary Streak', 'Win 10 games in a row',     'winning', 15),
  -- Rating
  ('rating_3_0',   'Rising Player', 'Reach a 3.0 rating', 'rating', 20),
  ('rating_3_5',   'Competitive',   'Reach a 3.5 rating', 'rating', 21),
  ('rating_4_0',   'Advanced',      'Reach a 4.0 rating', 'rating', 22),
  ('rating_4_5',   'Elite',         'Reach a 4.5+ rating','rating', 23),
  -- Community
  ('groups_3',          'Social Butterfly', 'Join 3 different groups',       'community', 30),
  ('groups_5',          'Community Pillar',  'Join 5 different groups',       'community', 31),
  ('first_forum_post',  'Voice Heard',       'Create your first forum post',  'community', 32),
  ('forum_posts_10',    'Contributor',       'Create 10 forum posts',         'community', 33),
  -- Tournament
  ('first_tournament',  'Competitor',        'Enter your first tournament',   'tournament', 40),
  ('tournament_win',    'Champion',          'Win a tournament',              'tournament', 41),
  ('tournaments_5',     'Tournament Regular','Enter 5 tournaments',           'tournament', 42),
  -- Ladder
  ('step_1',            'Top of the Ladder', 'Reach Step 1 in any group',     'ladder', 50);
