-- ============================================================
-- Migration 021: Tournament Divisions
-- Replace single skill_level with divisions (array of category permutations)
-- Gender x Age x Skill Level checkboxes
-- ============================================================

-- Add divisions column (array of division codes)
ALTER TABLE tournaments ADD COLUMN divisions TEXT[] NOT NULL DEFAULT '{}';

-- Migrate existing skill_level data into divisions for backwards compatibility
-- Map old values to a reasonable default division
UPDATE tournaments SET divisions = CASE
  WHEN skill_level = 'open' THEN ARRAY['mens_all_ages_3.0','mens_all_ages_3.5','mens_all_ages_4.0','mens_all_ages_4.5+','womens_all_ages_3.0','womens_all_ages_3.5','womens_all_ages_4.0','womens_all_ages_4.5+','mixed_all_ages_3.0','mixed_all_ages_3.5','mixed_all_ages_4.0','mixed_all_ages_4.5+']
  WHEN skill_level = 'beginner' THEN ARRAY['mens_all_ages_3.0','womens_all_ages_3.0','mixed_all_ages_3.0']
  WHEN skill_level = 'intermediate' THEN ARRAY['mens_all_ages_3.5','mens_all_ages_4.0','womens_all_ages_3.5','womens_all_ages_4.0','mixed_all_ages_3.5','mixed_all_ages_4.0']
  WHEN skill_level = 'advanced' THEN ARRAY['mens_all_ages_4.5+','womens_all_ages_4.5+','mixed_all_ages_4.5+']
  ELSE '{}'
END;

-- Drop the old skill_level column
ALTER TABLE tournaments DROP COLUMN skill_level;

-- Add division column to registrations so players pick which division they're in
ALTER TABLE tournament_registrations ADD COLUMN division TEXT;
