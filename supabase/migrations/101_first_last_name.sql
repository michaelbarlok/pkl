-- ============================================================
-- Migration 101: First name + last name on profiles
--
-- Adds split-name columns and backfills from full_name. display_name
-- and full_name stay untouched, so every UI that renders names today
-- (sheets, leaderboards, brackets, forum, notifications) keeps showing
-- exactly what it shows now.
--
-- New signups will populate first_name + last_name + full_name +
-- display_name together. Existing users with NULL last_name get a
-- nudge modal client-side until they fill it in.
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name  TEXT;

-- Best-effort backfill: split full_name on the first whitespace.
-- - Single-word names → first_name = the word, last_name = NULL.
-- - Two-word names → cleanly split.
-- - Three-plus-word names → first word into first_name, the rest into
--   last_name (handles "de la Cruz", "Van Pelt", suffixes, etc. — the
--   user can correct it on the profile edit page if needed).
UPDATE profiles
SET
  first_name = NULLIF(split_part(trim(full_name), ' ', 1), ''),
  last_name  = NULLIF(
    trim(substring(trim(full_name) FROM (
      CASE
        WHEN position(' ' IN trim(full_name)) = 0 THEN length(trim(full_name)) + 1
        ELSE position(' ' IN trim(full_name)) + 1
      END
    ))),
    ''
  )
WHERE full_name IS NOT NULL
  AND first_name IS NULL
  AND last_name  IS NULL;

NOTIFY pgrst, 'reload schema';
