-- ============================================================
-- Migration 035: Fix group_memberships RLS infinite recursion
-- ============================================================
-- The "Group admins can add members" INSERT policy on group_memberships
-- queries group_memberships to check admin status, causing infinite
-- recursion. Use a SECURITY DEFINER function to bypass RLS for that check.

CREATE OR REPLACE FUNCTION is_group_admin(p_group_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM group_memberships gm
    JOIN profiles p ON p.id = gm.player_id
    WHERE gm.group_id = p_group_id
      AND p.user_id = auth.uid()
      AND gm.group_role = 'admin'
  );
$$;

-- Drop the recursive policy and recreate using the function
DROP POLICY IF EXISTS "Group admins can add members" ON group_memberships;

CREATE POLICY "Group admins can add members"
  ON group_memberships FOR INSERT
  WITH CHECK (is_group_admin(group_id));
