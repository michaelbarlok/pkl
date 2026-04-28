-- ============================================================
-- Migration 100: Archive table for "left" group memberships
--
-- When a player leaves a group, we move their group_memberships
-- row into this archive table instead of dropping their stats.
-- If they later rejoin, the join path looks here first and
-- restores current_step, win_pct, total_sessions, etc. so leaving
-- isn't punitive (e.g. snowbirds, seasonal players).
-- ============================================================

CREATE TABLE IF NOT EXISTS left_group_memberships (
  group_id          UUID REFERENCES shootout_groups(id) ON DELETE CASCADE NOT NULL,
  player_id         UUID REFERENCES profiles(id)        ON DELETE CASCADE NOT NULL,
  current_step      INTEGER       NOT NULL,
  win_pct           NUMERIC(5,2)  NOT NULL DEFAULT 0,
  total_sessions    INTEGER       NOT NULL DEFAULT 0,
  last_played_at    TIMESTAMPTZ,
  joined_at         TIMESTAMPTZ   NOT NULL,
  imported_win_pct  NUMERIC(5,2),
  signup_priority   TEXT          NOT NULL DEFAULT 'normal',
  group_role        TEXT          NOT NULL DEFAULT 'member',
  left_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_id, player_id)
);

ALTER TABLE left_group_memberships ENABLE ROW LEVEL SECURITY;

-- A player can see their own archived row (lets future UI show
-- "we'll restore your stats if you rejoin" copy).
CREATE POLICY "Self can view own archive"
  ON left_group_memberships FOR SELECT USING (
    player_id = (SELECT id FROM profiles WHERE user_id = auth.uid())
  );

-- Site admins manage everything.
CREATE POLICY "Admins can manage left memberships"
  ON left_group_memberships FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin')
  );

NOTIFY pgrst, 'reload schema';
