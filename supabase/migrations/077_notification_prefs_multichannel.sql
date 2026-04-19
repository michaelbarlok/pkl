-- ============================================================
-- 077: Multi-channel notification preferences.
--
-- profiles.notification_preferences was a JSONB map of
--   notification_type -> "email" | "push" | "off"
-- which forced users to pick a single delivery channel per type.
-- We now allow any combination: the value becomes an array of
-- channels, with the empty array acting as "off".
--
--   "email"        -> ["email"]
--   "push"         -> ["push"]
--   "off"          -> []
--   ["email"]      -> unchanged
--   ["email","push"] -> unchanged
--
-- Column stays JSONB. Backfill walks the object with jsonb_each.
-- ============================================================

UPDATE profiles
SET notification_preferences = COALESCE(
  (
    SELECT jsonb_object_agg(
      key,
      CASE
        WHEN jsonb_typeof(value) = 'array' THEN value
        WHEN value = to_jsonb('off'::text)   THEN '[]'::jsonb
        WHEN value = to_jsonb('email'::text) THEN '["email"]'::jsonb
        WHEN value = to_jsonb('push'::text)  THEN '["push"]'::jsonb
        ELSE value
      END
    )
    FROM jsonb_each(notification_preferences)
  ),
  '{}'::jsonb
)
WHERE notification_preferences IS NOT NULL
  AND notification_preferences <> '{}'::jsonb;
