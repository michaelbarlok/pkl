-- Allow ephemeral guest profiles that have no auth.users account.
-- Postgres treats multiple NULLs as distinct for UNIQUE constraints,
-- so the existing UNIQUE on user_id continues to work correctly.

ALTER TABLE profiles ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_guest BOOLEAN NOT NULL DEFAULT false;
