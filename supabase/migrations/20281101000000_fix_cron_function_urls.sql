-- Fix: every pg_cron -> Edge Function job was built on a URL that cannot resolve.
--
-- Three broken patterns were in use:
--   1. url := 'https://supabase.local/functions/v1/...'   (host does not exist)
--   2. url := 'http://kong:8000/functions/v1/...'         (self-hosted only)
--   3. url := current_setting('app.settings.supabase_url', true) || '/functions/...'
--      ...and app.settings.supabase_url was NEVER configured, so it is NULL and the
--      concatenation yields NULL.
--
-- Evidence: 19 jobs were active; net._http_response rows carried a NULL status_code,
-- i.e. the requests failed at DNS/connect before reaching any function.
--
-- Why the jobs are rewritten in place instead of re-created: cron.alter_job() keeps
-- each job's schedule, payload and headers intact, so only the broken expressions
-- change. The base URL is hardcoded because ALTER DATABASE/ALTER ROLE ... SET
-- app.settings.* is rejected for the management-API role (42501), and the project
-- ref is a stable, non-secret value.
--
-- NOTE: this fixes the addressing only. The Edge Functions must also be deployed
-- (`supabase functions deploy`) or these jobs will receive 404 from the edge.

DO $$
DECLARE
  r RECORD;
  newcmd text;
BEGIN
  FOR r IN
    SELECT jobid, command FROM cron.job
    WHERE command LIKE '%supabase.local%'
       OR command LIKE '%kong:8000%'
       OR command LIKE '%app.settings.supabase_url%'
       OR command LIKE '%app.settings.supabase_service_role_key%'
  LOOP
    newcmd := replace(r.command, 'https://supabase.local', 'https://pvbcdndqjguzqeafhwhw.supabase.co');
    newcmd := replace(newcmd, 'http://kong:8000', 'https://pvbcdndqjguzqeafhwhw.supabase.co');
    newcmd := replace(newcmd, 'current_setting(''app.settings.supabase_url'', true)', '''https://pvbcdndqjguzqeafhwhw.supabase.co''');
    -- A missing service-role key must not null out the whole header JSON.
    newcmd := replace(newcmd, 'current_setting(''app.settings.supabase_service_role_key'', true)',
                               'COALESCE(current_setting(''app.settings.supabase_service_role_key'', true), '''')');
    PERFORM cron.alter_job(job_id := r.jobid, command := newcmd);
  END LOOP;
END $$;
