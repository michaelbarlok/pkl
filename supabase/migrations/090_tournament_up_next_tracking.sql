-- Remember whether we've already sent the "you're up next" push for
-- this match. The engine only sends when the match becomes the top of
-- the queue for the first time; matches that later get assigned a
-- court or get un-queued don't flip the flag back, which is fine
-- because a match can't re-enter "up next" position without a
-- schedule change.
ALTER TABLE tournament_matches
  ADD COLUMN IF NOT EXISTS up_next_notified_at TIMESTAMPTZ;
