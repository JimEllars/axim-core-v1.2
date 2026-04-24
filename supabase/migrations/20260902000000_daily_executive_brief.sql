-- Enable pg_cron if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA "extensions";

-- Schedule daily executive brief at 12:00 PM UTC
SELECT cron.schedule(
  'daily-executive-brief',
  '0 12 * * *',
  $$
    SELECT net.http_post(
        url:='http://kong:8000/functions/v1/onyx-bridge',
        body:=jsonb_build_object(
            'prompt', 'Read yesterday''s telemetry logs. Summarize total conversions, QA failures, and uptime incidents into a 3-bullet-point Markdown report. Email this report using the escalateToAdmin tool with the subject ''Daily AXiM Executive Brief''.'
        ),
        headers:=jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
        )
    );
  $$
);
