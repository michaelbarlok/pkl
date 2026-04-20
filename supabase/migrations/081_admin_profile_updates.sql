-- 081: Let platform admins update any profile
--
-- Context: the only UPDATE policy on profiles was
-- "Users can update own profile" USING (auth.uid() = user_id).
-- When an admin opened /players/[id]/edit for a member and hit Save,
-- Postgres's RLS silently filtered the UPDATE to zero rows (RLS
-- doesn't error on UPDATE — it just no-ops the rows the caller
-- can't touch). The client saw a "success" toast and nothing
-- changed — the classic display-name-fix bug.
--
-- This policy adds an admin exception. Group admins aren't included
-- here — if we want to let group admins correct the name of a
-- member of their group, we'd scope it to profiles linked by
-- group_memberships, but platform admin is the right grant for the
-- bug the user hit.

CREATE POLICY "Admins can update any profile"
  ON profiles
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM profiles admin_profile
      WHERE admin_profile.user_id = auth.uid()
        AND admin_profile.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM profiles admin_profile
      WHERE admin_profile.user_id = auth.uid()
        AND admin_profile.role = 'admin'
    )
  );
