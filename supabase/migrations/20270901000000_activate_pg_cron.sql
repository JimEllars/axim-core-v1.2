-- Enable the pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule nightly cognitive compression (RAG backfill)
SELECT cron.schedule('nightly_cognitive_compression', '0 2 * * *', $$
  SELECT net.http_post(
    url:='https://supabase.local/functions/v1/cognitive-compression',
    headers:='{"Authorization": "Bearer ' || current_setting('app.settings.supabase_service_role_key', true) || '", "Content-Type": "application/json"}'::jsonb,
    body:='{}'::jsonb
  );
$$);

-- Schedule workflow execution engine
SELECT cron.schedule('workflow_execution_engine', '* * * * *', $$
  SELECT net.http_post(
    url:='https://supabase.local/functions/v1/workflow-engine',
    headers:='{"Authorization": "Bearer ' || current_setting('app.settings.supabase_service_role_key', true) || '", "Content-Type": "application/json"}'::jsonb,
    body:='{}'::jsonb
  );
$$);
