ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS payment_link TEXT,
  ADD COLUMN IF NOT EXISTS payment_directions TEXT;
