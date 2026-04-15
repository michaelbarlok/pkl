-- Allow group admins to soft-delete (UPDATE deleted_at) and hard-delete forum
-- threads in their group, and to delete any reply in their group.

-- Thread UPDATE (for soft-delete via deleted_at)
CREATE POLICY "Group admins can update threads"
  ON forum_threads FOR UPDATE USING (
    is_group_admin(forum_threads.group_id)
  );

-- Thread hard DELETE (for completeness / bulk remove)
CREATE POLICY "Group admins can delete threads"
  ON forum_threads FOR DELETE USING (
    is_group_admin(forum_threads.group_id)
  );

-- Reply DELETE
CREATE POLICY "Group admins can delete replies"
  ON forum_replies FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM forum_threads ft
      WHERE ft.id = forum_replies.thread_id
        AND is_group_admin(ft.group_id)
    )
  );
