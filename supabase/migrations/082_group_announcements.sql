-- Persist each broadcast announcement as its own row so notifications
-- can deep-link to /groups/<slug>/announcements/<id>. Prior to this the
-- broadcast only fanned out notifications (with no backing record), so
-- the "View" link 404'd for everyone.
CREATE TABLE group_announcements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES shootout_groups(id) ON DELETE CASCADE,
  sent_by UUID NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX group_announcements_group_id_created_at_idx
  ON group_announcements (group_id, created_at DESC);

ALTER TABLE group_announcements ENABLE ROW LEVEL SECURITY;

-- Members of the group (and site admins) can read announcements.
CREATE POLICY "Members can view group announcements"
  ON group_announcements FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM group_memberships gm
      JOIN profiles p ON p.id = gm.player_id
      WHERE gm.group_id = group_announcements.group_id
        AND p.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.user_id = auth.uid() AND p.role = 'admin'
    )
  );

-- Only group admins (or site admins) can insert.
CREATE POLICY "Group admins can send announcements"
  ON group_announcements FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM group_memberships gm
      JOIN profiles p ON p.id = gm.player_id
      WHERE gm.group_id = group_announcements.group_id
        AND p.user_id = auth.uid()
        AND gm.group_role = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.user_id = auth.uid() AND p.role = 'admin'
    )
  );
