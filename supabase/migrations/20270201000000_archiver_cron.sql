create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Schedule the telemetry-archiver function to run every Sunday at 2:00 AM
SELECT cron.schedule(
    'telemetry_archive_weekly',
    '0 2 * * 0',
    $$
    SELECT net.http_post(
        url:='https://supabase.local/functions/v1/telemetry-archiver',
        headers:='{"Authorization": "Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}"}'::jsonb,
        body:='{}'::jsonb
    );
    $$
);
