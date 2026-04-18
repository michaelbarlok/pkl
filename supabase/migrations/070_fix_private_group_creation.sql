-- ============================================================
-- Migration 070: Fix private group creation for regular members
-- ============================================================
--
-- Bug: When a non-admin user creates a private group, the
-- auto_create_group_preferences trigger runs during the INSERT
-- and hits the "Group creators can insert preferences" policy
-- from migration 030. That policy evaluates:
--
--   EXISTS (SELECT 1 FROM shootout_groups sg
--           WHERE sg.id = group_preferences.group_id
--             AND sg.created_by = <caller's profile id>)
--
-- The inner SELECT is filtered by shootout_groups' SELECT policy
-- (migration 029), which for a freshly-created PRIVATE group
-- returns zero rows (creator has no membership yet, isn't a
-- global admin, and visibility != 'public'). EXISTS → false →
-- trigger INSERT fails → whole transaction rolls back → user
-- sees "database error".
--
-- Same failure also prevents `.insert().select().single()` from
-- returning the row on the client side (RETURNING passes through
-- the SELECT policy).
--
-- Fix: let creators always SELECT their own groups regardless of
-- visibility. This unblocks both the trigger's subquery and the
-- INSERT RETURNING path.

DROP POLICY IF EXISTS "Users can view public groups or groups they belong to"
  ON shootout_groups;

CREATE POLICY "Users can view public groups, own groups, or groups they belong to"
  ON shootout_groups FOR SELECT USING (
    visibility = 'public'
    OR created_by = (SELECT id FROM profiles WHERE user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM group_memberships gm
      WHERE gm.group_id = shootout_groups.id
        AND gm.player_id = (SELECT id FROM profiles WHERE user_id = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin'
    )
  );
