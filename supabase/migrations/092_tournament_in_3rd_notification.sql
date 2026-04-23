-- Track whether we've already fired the "you're #3 in the queue"
-- push for this match so it doesn't re-send on every engine pass.
-- Same pattern as up_next_notified_at.
ALTER TABLE tournament_matches
  ADD COLUMN IF NOT EXISTS in_3rd_notified_at TIMESTAMPTZ;
