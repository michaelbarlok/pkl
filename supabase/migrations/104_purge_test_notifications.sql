-- ============================================================
-- Migration 104: nightly purge of test-user notifications
--
-- Test users (profiles where is_test = true, or display_name has
-- "[TEST]" in it) generate notifications during e2e runs that
-- accumulate alongside real ones. They have zero value past the
-- moment they fire — nothing reads them, nobody clicks them — so
-- holding them for 30 days like real notifications is wasteful.
--
-- Adds a second pg_cron job that runs nightly at 03:05 UTC (5
-- minutes after the existing 30-day general purge from migration
-- 086) and deletes every notification belonging to a test profile
-- regardless of age. The criteria match how the rest of the app
-- identifies test users: profiles.is_test OR display_name LIKE '[TEST]%'.
-- ============================================================

SELECT cron.unschedule('purge-test-notifications')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'purge-test-notifications'
);

SELECT cron.schedule(
  'purge-test-notifications',
  '5 3 * * *',
  $$DELETE FROM public.notifications n
    USING public.profiles p
    WHERE n.user_id = p.id
      AND (p.is_test = true OR p.display_name ILIKE '%[TEST]%')$$
);
