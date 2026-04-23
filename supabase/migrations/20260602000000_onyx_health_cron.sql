-- Onyx Proactive Pulse CRON Job
SELECT cron.schedule(
    'onyx_health_pulse',
    '0 * * * *', -- Every 60 minutes
    $$
    SELECT net.http_post(
        url := 'https://supabase.local/functions/v1/onyx-bridge',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
        ),
        body := jsonb_build_object(
            'command', 'analyzeInternalInfrastructure'
        )
    );
    $$
);
