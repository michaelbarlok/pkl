-- Allow group admins to edit (UPDATE) game_results in their group's sessions.
-- Previously only the score's original submitter or a global admin could update.

DROP POLICY IF EXISTS "Players can update their scores" ON game_results;

CREATE POLICY "Players can update their scores"
  ON game_results FOR UPDATE USING (
    entered_by = (SELECT id FROM profiles WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin')
    OR is_group_admin(game_results.group_id)
  );
