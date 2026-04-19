-- ============================================================
-- 078: Sane default for group_preferences.max_step
--
-- max_step exists and the update_steps_on_round_complete RPC already
-- clamps with LEAST(max_step, ...), but the column default is 99 — far
-- above any group's actual ladder depth. A player who keeps finishing
-- last on the bottom court drifts indefinitely (e.g. step 6 -> 7 -> 8 -> ...)
-- before hitting the cap.
--
-- Lower the default to 6 (matching the typical UI). For groups that left
-- the default at 99, reset to 6 too — they never opted into 99, that's
-- just "I didn't think about this." Groups that intentionally chose a
-- non-99 value (e.g. 24) keep theirs.
-- ============================================================

ALTER TABLE group_preferences ALTER COLUMN max_step SET DEFAULT 6;

UPDATE group_preferences SET max_step = 6 WHERE max_step = 99;
