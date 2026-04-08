-- Fix Security Definer View advisor errors for all_time_stats and
-- free_play_player_stats.
--
-- Migration 037 used ALTER VIEW ... SET (security_invoker = on) which
-- sets the storage parameter but is not detected by Supabase's Security
-- Advisor. The advisor requires the view to be created with the
-- WITH (security_invoker = true) option in the CREATE statement itself.
-- Recreating both views achieves that.

-- ── all_time_stats ────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.all_time_stats
WITH (security_invoker = true)
AS
SELECT
  p.id AS player_id,
  p.full_name,
  p.display_name,
  p.skill_level,
  pr.display_rating,
  pr.elo_points,
  COALESCE(SUM(CASE WHEN gr.score_a > gr.score_b AND (gr.team_a_p1 = p.id OR gr.team_a_p2 = p.id) THEN 1
                    WHEN gr.score_b > gr.score_a AND (gr.team_b_p1 = p.id OR gr.team_b_p2 = p.id) THEN 1
                    ELSE 0 END), 0) AS total_wins,
  COALESCE(SUM(CASE WHEN gr.score_a < gr.score_b AND (gr.team_a_p1 = p.id OR gr.team_a_p2 = p.id) THEN 1
                    WHEN gr.score_b < gr.score_a AND (gr.team_b_p1 = p.id OR gr.team_b_p2 = p.id) THEN 1
                    ELSE 0 END), 0) AS total_losses,
  COUNT(DISTINCT sp.session_id) AS sessions_played
FROM profiles p
LEFT JOIN player_ratings pr ON p.id = pr.player_id
LEFT JOIN session_participants sp ON p.id = sp.player_id
LEFT JOIN game_results gr ON (
  gr.team_a_p1 = p.id OR gr.team_a_p2 = p.id OR
  gr.team_b_p1 = p.id OR gr.team_b_p2 = p.id
)
WHERE p.is_active = true
GROUP BY p.id, p.full_name, p.display_name, p.skill_level, pr.display_rating, pr.elo_points;

-- ── free_play_player_stats ────────────────────────────────────────────
CREATE OR REPLACE VIEW public.free_play_player_stats
WITH (security_invoker = true)
AS
SELECT
  group_id,
  player_id,
  COUNT(*) FILTER (WHERE won)     AS wins,
  COUNT(*) FILTER (WHERE NOT won) AS losses,
  SUM(point_diff)                 AS total_point_diff
FROM (
  SELECT m.group_id, m.team_a_p1 AS player_id,
    (m.score_a > m.score_b) AS won,
    (m.score_a - m.score_b) AS point_diff,
    m.played_at
  FROM free_play_matches m
  UNION ALL
  SELECT m.group_id, m.team_a_p2, (m.score_a > m.score_b), (m.score_a - m.score_b), m.played_at
  FROM free_play_matches m WHERE m.team_a_p2 IS NOT NULL
  UNION ALL
  SELECT m.group_id, m.team_b_p1, (m.score_b > m.score_a), (m.score_b - m.score_a), m.played_at
  FROM free_play_matches m
  UNION ALL
  SELECT m.group_id, m.team_b_p2, (m.score_b > m.score_a), (m.score_b - m.score_a), m.played_at
  FROM free_play_matches m WHERE m.team_b_p2 IS NOT NULL
) sub
JOIN shootout_groups g ON g.id = sub.group_id
WHERE sub.player_id IS NOT NULL
  AND (g.stats_reset_at IS NULL OR sub.played_at >= g.stats_reset_at)
GROUP BY group_id, player_id;
