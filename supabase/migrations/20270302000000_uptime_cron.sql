SELECT cron.schedule(
    'uptime-monitor',
    '*/5 * * * *',
    $$
    SELECT net.http_post(
        url:='http://kong:8000/functions/v1/uptime-monitor',
        headers:='{"Content-Type": "application/json"}'::jsonb,
        body:='{}'::jsonb
    ) as request_id;
    $$
);
