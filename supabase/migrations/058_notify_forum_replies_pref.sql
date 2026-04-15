-- Add per-player opt-in for forum reply notifications.
-- Default is false: thread authors are NOT notified when someone replies
-- unless they explicitly enable this setting in their profile.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS notify_forum_replies BOOLEAN NOT NULL DEFAULT false;
