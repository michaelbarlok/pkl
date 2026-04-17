-- Add ladder_type to shootout_groups to support two seeding modes:
--   court_promotion  (default) — target_court_next anchors players between sessions
--   dynamic_ranking             — each session re-seeds from scratch using updated steps/win_pct

ALTER TABLE shootout_groups
  ADD COLUMN IF NOT EXISTS ladder_type TEXT NOT NULL DEFAULT 'court_promotion'
    CHECK (ladder_type IN ('court_promotion', 'dynamic_ranking'));

-- All existing groups stay on court_promotion (already the default, explicit for clarity)
UPDATE shootout_groups SET ladder_type = 'court_promotion' WHERE ladder_type IS NULL;

CREATE INDEX IF NOT EXISTS shootout_groups_ladder_type_idx ON shootout_groups(ladder_type);
