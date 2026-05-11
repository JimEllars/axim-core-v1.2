-- Enable the pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule OSINT Scraper daily at midnight
SELECT cron.schedule(
  'osint-scraper-daily',
  '0 0 * * *',
  $$
  SELECT net.http_post(
      url := current_setting('app.settings.supabase_url', true) || '/functions/v1/osint-scraper',
      headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key', true)
      ),
      body := '{}'::jsonb
  ) as request_id;
  $$
);
