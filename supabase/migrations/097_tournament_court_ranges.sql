-- ============================================================
-- Migration 097: Tournament court ranges
--
-- Lets the organizer carve a tournament's overall court count into
-- labelled ranges and assign divisions to each range. Used at large
-- facilities where, e.g., Men's 3.0–4.5+ play on courts 1–10 and
-- Women's 3.0–4.5+ play on courts 11–20.
--
-- Relationship to existing tables:
--   * tournaments.num_courts is still the canvas (total courts).
--   * The Court Tracker stays one global view across all courts.
--   * The Match Queue splits — each row here defines a queue that
--     only holds matches whose division is in `divisions`.
--   * If no rows exist for a tournament, queue assignment falls back
--     to the existing "any division on any court" behavior.
--
-- Range overlap, division-collision, and court_end ≤ num_courts are
-- enforced by the write API rather than DB constraints — easier to
-- give the organizer specific error messages than to interpret a
-- generic constraint violation.
-- ============================================================

CREATE TABLE IF NOT EXISTS tournament_court_ranges (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  -- Organizer-facing label, e.g. "Men's Side" / "Outer courts".
  label         TEXT NOT NULL,
  -- Inclusive range [court_start, court_end] referring to court
  -- numbers as the Court Tracker shows them (1-indexed).
  court_start   INTEGER NOT NULL CHECK (court_start >= 1),
  court_end     INTEGER NOT NULL,
  CONSTRAINT court_range_bounds CHECK (court_end >= court_start),
  -- Division codes assigned to this range. Only matches in one of
  -- these divisions land in this range's queue. Empty array = the
  -- range is reserved for nothing yet (display-only placeholder).
  divisions     TEXT[] NOT NULL DEFAULT '{}',
  -- Display order in the organizer UI; the assignment algorithm
  -- doesn't care about it.
  position      INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tournament_court_ranges_tournament_idx
  ON tournament_court_ranges (tournament_id);

ALTER TABLE tournament_court_ranges ENABLE ROW LEVEL SECURITY;

-- Anyone in the tournament audience can see the ranges (the bracket
-- page renders them so players know where to play). Only organizers
-- write.
DROP POLICY IF EXISTS "Anyone can view court ranges" ON tournament_court_ranges;
CREATE POLICY "Anyone can view court ranges"
  ON tournament_court_ranges FOR SELECT USING (true);

DROP POLICY IF EXISTS "Organizers can insert court ranges" ON tournament_court_ranges;
CREATE POLICY "Organizers can insert court ranges"
  ON tournament_court_ranges FOR INSERT WITH CHECK (
    is_tournament_organizer(tournament_id)
  );

DROP POLICY IF EXISTS "Organizers can update court ranges" ON tournament_court_ranges;
CREATE POLICY "Organizers can update court ranges"
  ON tournament_court_ranges FOR UPDATE USING (
    is_tournament_organizer(tournament_id)
  );

DROP POLICY IF EXISTS "Organizers can delete court ranges" ON tournament_court_ranges;
CREATE POLICY "Organizers can delete court ranges"
  ON tournament_court_ranges FOR DELETE USING (
    is_tournament_organizer(tournament_id)
  );

-- New table → tell PostgREST so the JS client can find it without
-- waiting for the schema cache TTL.
NOTIFY pgrst, 'reload schema';
