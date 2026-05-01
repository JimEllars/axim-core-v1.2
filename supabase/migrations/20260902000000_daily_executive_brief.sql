-- Enable pg_cron if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA "extensions";

-- Schedule daily executive brief at 12:00 PM UTC
SELECT cron.schedule(
  'daily-executive-brief',
  '0 12 * * *',
  $$
    SELECT net.http_post(
        url:=(SELECT current_setting('app.settings.supabase_url', true)) || '/functions/v1/executive-report',
        headers:='{"Authorization": "Bearer ' || (SELECT current_setting('app.settings.supabase_service_role_key', true)) || '"}'::jsonb
    );
  $$
);
