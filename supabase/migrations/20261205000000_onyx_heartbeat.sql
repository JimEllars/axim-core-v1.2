-- Enable the pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create an RPC to check the gateways
CREATE OR REPLACE FUNCTION check_gateways_heartbeat()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    req_id bigint;
BEGIN
    -- We can just call an edge function that does the synchronous fetching to easily
    -- handle the logic of verifying both gateways and inserting the alert to telemetry_logs.
    -- Since we need to create the logic, let's just make an edge function 'gateway-heartbeat'
    -- or we can just use pg_net and a callback. But since pg_net callbacks are complex,
    -- let's just use pg_net to hit a new Edge Function that we create, or I will create an Edge function now.

    -- Alternatively, since we can't easily wait, let's just create a cron job that triggers an edge function
    -- Let's define the cron job here.

    SELECT cron.schedule(
        'onyx-gateway-heartbeat',
        '*/60 * * * *',
        $$
        SELECT net.http_post(
            url := current_setting('app.settings.supabase_url', true) || '/functions/v1/gateway-heartbeat',
            headers := jsonb_build_object(
                'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key', true),
                'Content-Type', 'application/json'
            )
        );
        $$
    );
END;
$$;

-- Run it once to initialize the cron
SELECT check_gateways_heartbeat();
