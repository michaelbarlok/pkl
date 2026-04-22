-- Add single-attachment support to group announcements. We track the
-- public URL (for the detail page + email link), the MIME type (so the
-- UI can decide "render inline <img>" vs "Open PDF link"), and the
-- original filename (shown in the PDF link text).
--
-- One attachment per announcement keeps the UI simple; a future table
-- could generalise this to multiple. The columns are nullable so
-- existing rows continue to work.
ALTER TABLE group_announcements
  ADD COLUMN attachment_url TEXT,
  ADD COLUMN attachment_type TEXT,
  ADD COLUMN attachment_name TEXT;

-- Storage bucket for announcement attachments. Public read makes the
-- URL viable in email and the detail page without minting signed URLs
-- per-member; access to the containing row is still gated by the
-- existing group_announcements RLS, so non-members can't discover IDs
-- in the UI. Uploads require auth — policies below enforce that only
-- group admins (or site admins) can write.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'announcement-attachments',
  'announcement-attachments',
  true,
  10 * 1024 * 1024,  -- 10 MB per file
  ARRAY[
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'image/heic',
    'image/heif',
    'application/pdf'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Public read on the bucket. RLS on storage.objects is already
-- enabled by default on Supabase; we add an explicit select policy
-- scoped to this bucket so nothing else leaks.
DROP POLICY IF EXISTS "Public read on announcement attachments" ON storage.objects;
CREATE POLICY "Public read on announcement attachments"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'announcement-attachments');

-- Only group admins (or site admins) can upload. The object path
-- convention is `<group_id>/<filename>` — the first path segment
-- lets the policy match the uploader's group_memberships row. Site
-- admins bypass the path check entirely.
DROP POLICY IF EXISTS "Group admins can upload announcement attachments" ON storage.objects;
CREATE POLICY "Group admins can upload announcement attachments"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'announcement-attachments'
    AND (
      EXISTS (
        SELECT 1 FROM group_memberships gm
        JOIN profiles p ON p.id = gm.player_id
        WHERE gm.group_role = 'admin'
          AND p.user_id = auth.uid()
          AND gm.group_id::text = (storage.foldername(name))[1]
      )
      OR EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.user_id = auth.uid() AND p.role = 'admin'
      )
    )
  );

-- Same rule for delete so admins can clean up mistakes.
DROP POLICY IF EXISTS "Group admins can delete announcement attachments" ON storage.objects;
CREATE POLICY "Group admins can delete announcement attachments"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'announcement-attachments'
    AND (
      EXISTS (
        SELECT 1 FROM group_memberships gm
        JOIN profiles p ON p.id = gm.player_id
        WHERE gm.group_role = 'admin'
          AND p.user_id = auth.uid()
          AND gm.group_id::text = (storage.foldername(name))[1]
      )
      OR EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.user_id = auth.uid() AND p.role = 'admin'
      )
    )
  );
