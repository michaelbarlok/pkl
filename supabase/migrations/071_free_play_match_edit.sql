-- ============================================================
-- Migration 071: Allow group admins to edit free play matches
-- ============================================================
-- Adds UPDATE policy so group admins can correct scores and
-- player assignments on already-persisted free_play_matches rows.

CREATE POLICY "Group admins can update free play matches"
  ON free_play_matches FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM group_memberships gm
      JOIN profiles p ON p.id = gm.player_id
      WHERE gm.group_id = free_play_matches.group_id
        AND p.user_id = auth.uid()
        AND gm.group_role = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin'
    )
  );
