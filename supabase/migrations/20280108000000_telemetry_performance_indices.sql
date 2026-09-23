CREATE TABLE IF NOT EXISTS public.telemetry_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_id TEXT,
    event_type TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 1. Composite index for fast app-scoped and event-scoped queries
CREATE INDEX IF NOT EXISTS idx_telemetry_events_app_event_created
  ON public.telemetry_events (app_id, event_type, created_at DESC);

-- 2. Functional GIN expression index on metadata for ISP and Colo filtering
CREATE INDEX IF NOT EXISTS idx_telemetry_events_metadata_isp
  ON public.telemetry_events ((metadata->>'isp'))
  WHERE metadata->>'isp' IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_telemetry_events_metadata_colo
  ON public.telemetry_events ((metadata->>'colo'))
  WHERE metadata->>'colo' IS NOT NULL;
