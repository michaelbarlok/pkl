-- Allow any authenticated user to create groups (not just global admins).
-- The existing "Admins can manage groups" policy covers UPDATE/DELETE for admins.
-- We add a separate INSERT policy for all authenticated users.

CREATE POLICY "Authenticated users can create groups"
  ON shootout_groups FOR INSERT WITH CHECK (
    created_by = (SELECT id FROM profiles WHERE user_id = auth.uid())
  );

-- Allow the group creator to insert group preferences for their new group.
-- The trigger auto_create_group_preferences handles this for ladder_league,
-- but we also need the creator to be able to upsert preferences.
CREATE POLICY "Group creators can insert preferences"
  ON group_preferences FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM shootout_groups sg
      WHERE sg.id = group_preferences.group_id
        AND sg.created_by = (SELECT id FROM profiles WHERE user_id = auth.uid())
    )
  );

-- Allow group creators/admins to update their group's preferences
CREATE POLICY "Group admins can update preferences"
  ON group_preferences FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM group_memberships gm
      WHERE gm.group_id = group_preferences.group_id
        AND gm.player_id = (SELECT id FROM profiles WHERE user_id = auth.uid())
        AND gm.group_role = 'admin'
    )
  );
