-- Enable pg_cron if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA "extensions";

-- Schedule weekly financial audit every Sunday at 2:00 AM UTC
SELECT cron.schedule(
  'weekly-financial-audit',
  '0 2 * * 0',
  $$
    SELECT net.http_post(
        url:='http://kong:8000/functions/v1/financial-audit',
        headers:=jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
        )
    );
  $$
);
