CREATE OR REPLACE FUNCTION public.proc_notify_telemetry_breach()
RETURNS TRIGGER AS $$
BEGIN
    -- Immediately escalate WARN, ERROR, or FATAL events
    IF NEW.severity IN ('WARN', 'ERROR', 'FATAL') THEN
        -- Auto-populate a pending triage record
        INSERT INTO public.triage_actions (event_id, status)
        VALUES (NEW.id, 'UNTRIAGED')
        ON CONFLICT DO NOTHING;

        -- Broadcast via PostgreSQL channel for listening Onyx runtimes
        PERFORM pg_notify(
            'telemetry_alert_bus',
            json_build_object(
                'event_id', NEW.id,
                'component', NEW.component_id,
                'severity', NEW.severity,
                'error_code', NEW.error_code,
                'message', NEW.message
            )::text
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_on_telemetry_ingest ON public.telemetry_events;
CREATE TRIGGER trg_on_telemetry_ingest
    AFTER INSERT ON public.telemetry_events
    FOR EACH ROW
    EXECUTE FUNCTION public.proc_notify_telemetry_breach();
