-- ============================================================
-- Migration 029: Group Visibility (Public / Private)
-- ============================================================

-- Add visibility column: 'public' (default) or 'private'
ALTER TABLE shootout_groups
  ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public'
  CHECK (visibility IN ('public', 'private'));

-- Replace the existing SELECT policy with one that hides private groups
-- from non-members.
DROP POLICY IF EXISTS "Anyone can view active groups" ON shootout_groups;

CREATE POLICY "Users can view public groups or groups they belong to"
  ON shootout_groups FOR SELECT USING (
    visibility = 'public'
    OR EXISTS (
      SELECT 1 FROM group_memberships gm
      WHERE gm.group_id = shootout_groups.id
        AND gm.player_id = (SELECT id FROM profiles WHERE user_id = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Allow group members (admin role) to add other members to private groups
-- (existing policy only allows self-join via INSERT)
CREATE POLICY "Group admins can add members"
  ON group_memberships FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM group_memberships gm
      WHERE gm.group_id = group_memberships.group_id
        AND gm.player_id = (SELECT id FROM profiles WHERE user_id = auth.uid())
        AND gm.group_role = 'admin'
    )
  );
