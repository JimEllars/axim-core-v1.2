select cron.schedule('telemetry_archive', '0 0 * * 0', $$ select net.http_post( url:='https://supabase.local/functions/v1/telemetry-archiver', headers:='{"Authorization": "Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}"}'::jsonb, body:='{}'::jsonb ); $$);

select cron.schedule('content_engine_daily', '0 9 * * *', $$ select net.http_post( url:='https://supabase.local/functions/v1/axim-content-engine', headers:='{"Authorization": "Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}", "Content-Type": "application/json"}'::jsonb, body:='{}'::jsonb ); $$);

-- Nightly Cognitive Compression
select cron.schedule('nightly_cognitive_compression', '0 2 * * *', $$ select net.http_post( url:='https://supabase.local/functions/v1/cognitive-compression', headers:='{"Authorization": "Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}", "Content-Type": "application/json"}'::jsonb, body:='{}'::jsonb ); $$);
