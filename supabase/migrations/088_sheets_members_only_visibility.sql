-- Tighten sign-up sheet visibility to group members only.
--
-- The original policy in 002 was `USING (true)`, which let any
-- authenticated user enumerate every group's sheets and rosters
-- regardless of whether they were a member. Tournaments remain
-- broadly visible (see tournaments.is_hidden); sign-up sheets are
-- intentionally scoped to the owning group.
--
-- Writes continue to flow through the service client in our API
-- routes (app/api/sheets/*), so we only touch the SELECT policies.

-- signup_sheets: visible to members of the owning group, site admins,
-- and the sheet creator (so an admin who just inserted a row can
-- still see it in their session even if their membership row wasn't
-- pre-populated by tests/fixtures).
DROP POLICY IF EXISTS "Anyone can view signup sheets" ON signup_sheets;
DROP POLICY IF EXISTS "Members can view group signup sheets" ON signup_sheets;
CREATE POLICY "Members can view group signup sheets"
  ON signup_sheets FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM group_memberships gm
      JOIN profiles p ON p.id = gm.player_id
      WHERE gm.group_id = signup_sheets.group_id
        AND p.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.user_id = auth.uid() AND p.role = 'admin'
    )
  );

-- registrations: visibility follows the sheet. Players can always see
-- their own registration (needed so they can cancel from outside the
-- group), group members see everyone's registrations on their
-- group's sheets, site admins see all.
DROP POLICY IF EXISTS "Anyone can view registrations" ON registrations;
DROP POLICY IF EXISTS "Members can view registrations for their groups" ON registrations;
CREATE POLICY "Members can view registrations for their groups"
  ON registrations FOR SELECT USING (
    player_id = (SELECT id FROM profiles WHERE user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM signup_sheets s
      JOIN group_memberships gm ON gm.group_id = s.group_id
      JOIN profiles p ON p.id = gm.player_id
      WHERE s.id = registrations.sheet_id
        AND p.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.user_id = auth.uid() AND p.role = 'admin'
    )
  );
