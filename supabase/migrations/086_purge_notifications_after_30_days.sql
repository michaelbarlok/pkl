-- Shorten the notification retention window from 90 days to 30 days.
-- Notifications are by far our largest table by row-count and grow
-- every time we send a push/email, so tightening the TTL is the
-- simplest way to keep Free-tier DB size low. Historical context past
-- 30 days adds no player-facing value — the in-app bell only shows
-- recent ones and the deep-links (session detail, sheet detail,
-- announcement) remain accessible without the notification row.
--
-- cron.schedule with the same job name updates the existing schedule
-- in place on pg_cron >= 1.4. We unschedule first to be explicit and
-- safe across older versions.

SELECT cron.unschedule('purge-old-notifications')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'purge-old-notifications'
);

SELECT cron.schedule(
  'purge-old-notifications',
  '0 3 * * *',
  $$DELETE FROM public.notifications WHERE created_at < now() - interval '30 days'$$
);
