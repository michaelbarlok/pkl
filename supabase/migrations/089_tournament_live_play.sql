-- Tournament live-play infrastructure: courts, active divisions, match
-- queue state, and a coin-flip seed for deterministic tiebreakers.
--
-- This underpins the "divisions go active → matches auto-assign to
-- courts → players get notified" flow on the Play tab.

-- 1. Organizer-declared court count on the tournament itself.
ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS num_courts INTEGER;

-- 2. Division activation ledger. A row here means the division is
--    currently "in play" — its matches are eligible for court
--    assignment and players in that division are on the Play tab.
CREATE TABLE IF NOT EXISTS tournament_active_divisions (
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  division TEXT NOT NULL,
  activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tournament_id, division)
);

ALTER TABLE tournament_active_divisions ENABLE ROW LEVEL SECURITY;

-- Everyone registered in the tournament (or viewing publicly) can
-- read which divisions are active.
DROP POLICY IF EXISTS "View active divisions" ON tournament_active_divisions;
CREATE POLICY "View active divisions"
  ON tournament_active_divisions FOR SELECT USING (true);

-- Only tournament organizers (creator / co-organizer / site admin)
-- can activate/deactivate a division. Mirrors the tournament_matches
-- write policy pattern from migration 028.
DROP POLICY IF EXISTS "Organizers manage active divisions" ON tournament_active_divisions;
CREATE POLICY "Organizers manage active divisions"
  ON tournament_active_divisions FOR ALL
  USING (is_tournament_organizer(tournament_id))
  WITH CHECK (is_tournament_organizer(tournament_id));

-- 3. Match-level live state.
--    court_number      — the court the match is currently on. NULL
--                        means the match is either still pending
--                        eligibility or sitting in the queue.
--    queue_entered_at  — when the match became eligible (both teams
--                        free + all prior-round matches in its pool
--                        completed). Used as the FIFO order key
--                        across divisions.
--    coin_flip_seed    — small integer set at bracket-generation
--                        time. Drives the final "coin flip"
--                        tiebreaker deterministically so reloads
--                        don't re-shuffle standings.
ALTER TABLE tournament_matches
  ADD COLUMN IF NOT EXISTS court_number INTEGER,
  ADD COLUMN IF NOT EXISTS queue_entered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS coin_flip_seed INTEGER;

-- Helpful index for the assignment engine: find all queued matches
-- for a tournament ordered by eligibility, ignoring already-assigned
-- and already-completed rows.
CREATE INDEX IF NOT EXISTS tournament_matches_queue_idx
  ON tournament_matches (tournament_id, queue_entered_at)
  WHERE court_number IS NULL AND status = 'pending';

-- Same table, different lookup: "who is currently on a court?" — used
-- to detect free courts and to block assigning a team that's already
-- playing.
CREATE INDEX IF NOT EXISTS tournament_matches_on_court_idx
  ON tournament_matches (tournament_id, court_number)
  WHERE court_number IS NOT NULL AND status = 'pending';
