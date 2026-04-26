-- ============================================================
-- Migration 096: Reload PostgREST schema cache
--
-- Migration 091 created tournament_partner_requests but did not
-- end with a NOTIFY pgrst, so any environment that already ran 091
-- still has a PostgREST cache that doesn't know about the table.
-- This is the same trap that bit win_by_2 (093 → 094/095): the
-- next .insert/.update referencing tournament_partner_requests
-- columns can fail with "Could not find the X column of Y in the
-- schema cache" until the cache TTL eventually rolls.
--
-- This migration sends the NOTIFY explicitly so cache refreshes
-- the moment the migration applies. No schema change beyond that.
-- ============================================================

NOTIFY pgrst, 'reload schema';
