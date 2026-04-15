-- ============================================================
-- Migration 060: Pending Group Members
-- ============================================================
-- Stores CSV-imported stats for players who don't yet have an
-- account or aren't yet members of the group. When they sign up
-- (or join the group), their stats are automatically applied.

CREATE TABLE pending_group_members (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id       UUID NOT NULL REFERENCES shootout_groups(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,          -- display_name from CSV (used for matching)
  invite_email   TEXT,                   -- email hint for matching on signup
  step           INTEGER,
  win_pct        NUMERIC(5,2),
  total_sessions INTEGER,
  last_played_at TIMESTAMPTZ,
  joined_at      TIMESTAMPTZ,
  skill_level    NUMERIC(3,1),
  claimed_by     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  claimed_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique: one pending record per name per group (case-insensitive)
CREATE UNIQUE INDEX pgm_group_name_unique ON pending_group_members(group_id, LOWER(name));

-- Fast lookups
CREATE INDEX pgm_group_id_idx   ON pending_group_members(group_id);
CREATE INDEX pgm_email_idx      ON pending_group_members(LOWER(invite_email)) WHERE invite_email IS NOT NULL;
CREATE INDEX pgm_claimed_by_idx ON pending_group_members(claimed_by) WHERE claimed_by IS NOT NULL;

ALTER TABLE pending_group_members ENABLE ROW LEVEL SECURITY;

-- Group admins and global admins can do everything
CREATE POLICY "Admins can manage pending members"
  ON pending_group_members FOR ALL
  USING (
    is_group_admin(group_id)
    OR EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- Players can see pending records they claimed (needed so signup can confirm)
CREATE POLICY "Players can view their own claimed pending records"
  ON pending_group_members FOR SELECT
  USING (claimed_by = (SELECT id FROM profiles WHERE user_id = auth.uid()));
