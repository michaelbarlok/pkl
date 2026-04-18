CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule nightly purge of notifications older than 90 days (runs at 3am UTC)
SELECT cron.schedule(
  'purge-old-notifications',
  '0 3 * * *',
  $$DELETE FROM public.notifications WHERE created_at < now() - interval '90 days'$$
);
