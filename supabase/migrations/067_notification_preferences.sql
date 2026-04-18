-- Per-type notification preferences stored as JSONB.
-- Shape: { "new_sheet": { "email": true, "push": false }, ... }
-- Missing keys default to enabled (true).
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{}'::jsonb;
