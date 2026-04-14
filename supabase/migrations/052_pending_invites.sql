-- pending_invites: store CSV import data keyed by email
-- consumed at registration time to pre-populate profile fields

CREATE TABLE IF NOT EXISTS pending_invites (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT        NOT NULL,
  display_name  TEXT,
  first_name    TEXT,
  last_name     TEXT,
  phone         TEXT,
  skill_level   NUMERIC,
  gender        TEXT,
  date_of_birth TEXT,
  invited_by    UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  invited_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  message       TEXT,
  used_at       TIMESTAMPTZ
);

-- Allow fast lookup by email
CREATE INDEX IF NOT EXISTS pending_invites_email_idx ON pending_invites (lower(email));

-- RLS: only service-role/admin can read+write
ALTER TABLE pending_invites ENABLE ROW LEVEL SECURITY;

-- Admins (via service client) can do everything; no anonymous access
CREATE POLICY "service_role_all" ON pending_invites
  USING (true)
  WITH CHECK (true);
