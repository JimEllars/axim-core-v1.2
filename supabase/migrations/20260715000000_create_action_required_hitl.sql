create extension if not exists pg_cron;
create extension if not exists pg_net;

ALTER TABLE IF EXISTS public.hitl_audit_logs
ADD COLUMN IF NOT EXISTS action_required TEXT;

CREATE OR REPLACE FUNCTION public.escalate_sla_breaches()
RETURNS void AS $$
BEGIN
    UPDATE public.support_tickets
    SET status = 'Action Required'
    WHERE status != 'Closed' AND status != 'Resolved' AND status != 'Action Required'
      AND created_at < now() - interval '24 hours';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- In case pg_cron isn't loaded or available right away in tests, handle safely
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        BEGIN
            PERFORM cron.unschedule('escalate_sla_breaches_cron');
        EXCEPTION WHEN others THEN
            -- Ignore
        END;
        PERFORM cron.schedule('escalate_sla_breaches_cron', '*/15 * * * *', 'SELECT public.escalate_sla_breaches();');
    END IF;
END $$;
