CREATE TABLE IF NOT EXISTS system_status (
    id SERIAL PRIMARY KEY,
    key VARCHAR NOT NULL UNIQUE,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Initialize is_live status if not exists
INSERT INTO system_status (key, value)
VALUES ('is_live', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Enable the pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule the podcast poller to run every 6 hours
SELECT cron.schedule(
    'podcast-poller-job',
    '0 */6 * * *',
    $$
    SELECT net.http_post(
        url := current_setting('app.settings.supabase_url', true) || '/functions/v1/podcast-poller',
        headers := jsonb_build_object(
            'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key', true),
            'Content-Type', 'application/json'
        )
    );
    $$
);
