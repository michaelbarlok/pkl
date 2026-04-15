-- Group admins could INSERT new members (migration 035) but could not UPDATE
-- existing member data such as current_step and win_pct.  The inline step
-- editor in the admin groups UI was silently failing for group admins because
-- of this missing policy.

CREATE POLICY "Group admins can update members"
  ON group_memberships FOR UPDATE
  USING (is_group_admin(group_id));
