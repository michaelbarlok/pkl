-- Convert SECURITY DEFINER views to SECURITY INVOKER
-- so they respect the querying user's RLS policies
-- instead of the view creator's permissions.

ALTER VIEW all_time_stats SET (security_invoker = on);
ALTER VIEW free_play_player_stats SET (security_invoker = on);
