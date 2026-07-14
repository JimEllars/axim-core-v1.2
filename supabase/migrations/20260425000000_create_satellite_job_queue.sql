CREATE TYPE job_status AS ENUM ('pending', 'processing', 'completed', 'failed');

CREATE TABLE IF NOT EXISTS satellite_job_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_id VARCHAR,
    payload JSONB,
    status job_status DEFAULT 'pending',
    attempts INT DEFAULT 0,
    max_attempts INT DEFAULT 3,
    error_log TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

ALTER TABLE satellite_job_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow admin full access" ON satellite_job_queue
    FOR ALL
    TO authenticated
    USING ( (auth.jwt() ->> 'role'::text) = 'admin' );

-- Create trigger to automatically update the 'updated_at' column
CREATE OR REPLACE FUNCTION update_satellite_job_queue_modtime()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_satellite_job_queue_modtime
    BEFORE UPDATE ON satellite_job_queue
    FOR EACH ROW
    EXECUTE PROCEDURE update_satellite_job_queue_modtime();

-- And for the pg_cron job in phase 24
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
    'onyx_sentinel_15_min',
    '*/15 * * * *',
    $$
    SELECT net.http_post(
        url:=(SELECT current_setting('app.settings.supabase_url', true)) || '/functions/v1/onyx-sentinel',
        headers:='{"Authorization": "Bearer ' || (SELECT current_setting('app.settings.supabase_service_role_key', true)) || '"}'::jsonb
    );
    $$
);
