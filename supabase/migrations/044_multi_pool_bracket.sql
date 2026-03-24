-- ============================================================
-- Migration 044: Support multiple pools for 15+ team divisions
-- Relax bracket CHECK to allow pool_1, pool_2, pool_3, pool_4, etc.
-- ============================================================

ALTER TABLE tournament_matches DROP CONSTRAINT IF EXISTS tournament_matches_bracket_check;

ALTER TABLE tournament_matches ADD CONSTRAINT tournament_matches_bracket_check
  CHECK (bracket IN ('winners', 'losers', 'grand_final', 'playoff')
         OR bracket LIKE 'pool_%');
