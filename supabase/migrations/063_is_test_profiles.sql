-- Flag test accounts so they can be identified and filtered easily.
-- Any profile with [TEST] in display_name is a test account.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS profiles_is_test_idx ON profiles(is_test) WHERE is_test = true;

UPDATE profiles
SET is_test = true
WHERE display_name ILIKE '%[TEST]%';
