-- Add per-player, per-group signup priority to group_memberships.
-- high   = always placed on the active list immediately (bypasses the limit check)
-- normal = standard FIFO / first-come-first-served (default)
-- low    = always placed on the waitlist, even if spots are open

ALTER TABLE group_memberships
  ADD COLUMN IF NOT EXISTS signup_priority text NOT NULL DEFAULT 'normal'
    CHECK (signup_priority IN ('high', 'normal', 'low'));

COMMENT ON COLUMN group_memberships.signup_priority IS
  'Controls placement on signup sheets: high = always active, low = always waitlist, normal = FIFO';
