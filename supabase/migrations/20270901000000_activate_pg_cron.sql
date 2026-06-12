CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule('telemetry_archiver_daily', '0 2 * * *', $$ select net.http_post( url:='https://supabase.local/functions/v1/telemetry-archiver', headers:='{"Authorization": "Bearer ' || current_setting('app.settings.supabase_service_role_key', true) || '"}'::jsonb, body:='{}'::jsonb ); $$);

SELECT cron.schedule('autonomous_lead_scraper', '0 */6 * * *', $$ select net.http_post( url:='https://supabase.local/functions/v1/autonomous-lead-scraper', headers:='{"Authorization": "Bearer ' || current_setting('app.settings.supabase_service_role_key', true) || '"}'::jsonb, body:='{}'::jsonb ); $$);
