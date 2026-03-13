-- Add priority column to registrations
-- 'high' = top of list, 'normal' = first come first serve, 'low' = bottom of list
ALTER TABLE registrations
  ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal'
  CHECK (priority IN ('high', 'normal', 'low'));
