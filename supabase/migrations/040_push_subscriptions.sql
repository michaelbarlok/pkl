-- ============================================================
-- 040: Push notification subscriptions
-- ============================================================

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  subscription jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Index for fast lookup by profile
CREATE INDEX IF NOT EXISTS idx_push_subs_profile ON push_subscriptions (profile_id);

-- RLS: users can manage their own subscriptions
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own push subscriptions"
  ON push_subscriptions FOR SELECT
  USING (profile_id = (SELECT id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert own push subscriptions"
  ON push_subscriptions FOR INSERT
  WITH CHECK (profile_id = (SELECT id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete own push subscriptions"
  ON push_subscriptions FOR DELETE
  USING (profile_id = (SELECT id FROM profiles WHERE user_id = auth.uid()));

-- Service role can manage all (for cleanup of expired subs)
CREATE POLICY "Service role can manage all push subscriptions"
  ON push_subscriptions FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin'));

-- Update default preferred_notify to include 'push' for new users
ALTER TABLE profiles ALTER COLUMN preferred_notify SET DEFAULT ARRAY['email', 'push'];
