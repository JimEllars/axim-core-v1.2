create extension if not exists pg_cron;
create extension if not exists pg_net;

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

-- Schedule 4-hour scraper sweeps
SELECT cron.schedule('scraper_sweeps_4h', '0 */4 * * *', $$
  SELECT net.http_post(
    url:='https://supabase.local/functions/v1/scraper-sweeps',
    headers:='{"Authorization": "Bearer ' || current_setting('app.settings.supabase_service_role_key', true) || '", "Content-Type": "application/json"}'::jsonb,
    body:='{}'::jsonb
  );
$$);

-- Schedule daily executive briefs
SELECT cron.schedule('daily_executive_briefs', '0 6 * * *', $$
  SELECT net.http_post(
    url:='https://supabase.local/functions/v1/executive-report',
    headers:='{"Authorization": "Bearer ' || current_setting('app.settings.supabase_service_role_key', true) || '", "Content-Type": "application/json"}'::jsonb,
    body:='{}'::jsonb
  );
$$);

-- Schedule Onyx health heartbeats
SELECT cron.schedule('onyx_health_heartbeats', '*/15 * * * *', $$
  SELECT net.http_post(
    url:='https://supabase.local/functions/v1/onyx-health-heartbeat',
    headers:='{"Authorization": "Bearer ' || current_setting('app.settings.supabase_service_role_key', true) || '", "Content-Type": "application/json"}'::jsonb,
    body:='{}'::jsonb
  );
$$);
