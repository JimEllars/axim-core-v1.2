-- Create ecosystem_nodes table
CREATE TABLE IF NOT EXISTS public.ecosystem_nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_name TEXT NOT NULL,
    health_endpoint_url TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'operational',
    last_ping TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Optional: Enable RLS
ALTER TABLE public.ecosystem_nodes ENABLE ROW LEVEL SECURITY;

-- Basic policy: Allow read access to authenticated users
CREATE POLICY "Enable read access for all authenticated users" ON public.ecosystem_nodes
    FOR SELECT TO authenticated USING (true);

-- Allow service role full access
CREATE POLICY "Enable full access for service role" ON public.ecosystem_nodes
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Extension pg_net should already be available
CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";

-- Function to trigger the onyx-sentinel Edge Function
CREATE OR REPLACE FUNCTION trigger_onyx_sentinel()
RETURNS trigger AS $$
DECLARE
  payload json;
  request_id bigint;
BEGIN
  -- We only want to trigger when a node goes offline
  IF NEW.status = 'offline' AND OLD.status != 'offline' THEN
    payload := json_build_object('record', row_to_json(NEW));

    -- Standard http_post using pg_net to the internal kong router
    SELECT net.http_post(
        url:='http://kong:8000/functions/v1/onyx-sentinel',
        body:=payload::jsonb,
        headers:='{"Content-Type": "application/json"}'::jsonb
    ) INTO request_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create Trigger on ecosystem_nodes
DROP TRIGGER IF EXISTS ecosystem_nodes_sentinel_trigger ON public.ecosystem_nodes;

CREATE TRIGGER ecosystem_nodes_sentinel_trigger
AFTER UPDATE ON public.ecosystem_nodes
FOR EACH ROW
EXECUTE FUNCTION trigger_onyx_sentinel();
