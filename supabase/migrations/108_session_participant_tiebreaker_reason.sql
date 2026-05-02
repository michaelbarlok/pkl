-- Migration 108: persist the tiebreaker reason alongside pool_finish.
--
-- Why server-stamped: the client used to recompute the reason from
-- group_memberships, but those rows are overwritten by the round-
-- complete RPC before the user even sees the standings screen. Server-
-- side recompute has the pre-session memberMap on hand at the moment
-- the tie is broken, so it's the only place the right answer can be
-- written. Client just renders.

ALTER TABLE session_participants
  ADD COLUMN IF NOT EXISTS tiebreaker_reason TEXT;

NOTIFY pgrst, 'reload schema';
