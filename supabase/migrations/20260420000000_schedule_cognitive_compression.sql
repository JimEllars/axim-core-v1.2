-- Create extension for pg_net if it doesn't exist
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create extension for pg_cron if it doesn't exist
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule cognitive compression every night at 02:00 AM
select cron.schedule('nightly_cognitive_compression', '0 2 * * *', $$ select net.http_post( url:='https://supabase.local/functions/v1/cognitive-compression', headers:='{"Authorization": "Bearer <SUPABASE_SERVICE_ROLE_KEY>", "Content-Type": "application/json"}'::jsonb, body:='{}'::jsonb ); $$);
