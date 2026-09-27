-- 1. Create tables and columns if they don't exist to make the prompt's SQL valid
CREATE TABLE IF NOT EXISTS public.app_registry (
    app_id TEXT PRIMARY KEY,
    app_name TEXT NOT NULL,
    domain TEXT,
    status TEXT,
    category TEXT,
    health_endpoint TEXT,
    telemetry_enabled BOOLEAN,
    metadata JSONB
);

ALTER TABLE public.ecosystem_nodes
  ADD COLUMN IF NOT EXISTS node_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS endpoint TEXT,
  ADD COLUMN IF NOT EXISTS node_type TEXT,
  ADD COLUMN IF NOT EXISTS last_heartbeat TIMESTAMPTZ;

-- 1. Register SpeedReport.org in the Ecosystem App Registry
INSERT INTO public.app_registry (
  app_id,
  app_name,
  domain,
  status,
  category,
  health_endpoint,
  telemetry_enabled,
  metadata
) VALUES (
  'speedreport',
  'SpeedReport.org',
  'speedreport.org',
  'active',
  'network_utility',
  'https://speedreport.org/api/ping',
  true,
  '{"white_label": true, "target_audience": "commercial_enterprise", "version": "1.0.0"}'::jsonb
) ON CONFLICT (app_id) DO UPDATE SET
  status = 'active',
  health_endpoint = EXCLUDED.health_endpoint,
  telemetry_enabled = true;

-- 2. Seed Ecosystem Node for Fleet Health Tracking
INSERT INTO public.ecosystem_nodes (
  node_id,
  name,
  endpoint,
  node_type,
  status,
  last_heartbeat,
  app_name,
  health_endpoint_url
) VALUES (
  'node_speedreport_edge',
  'SpeedReport Edge Engine',
  'https://speedreport.org/api/meta',
  'edge_worker',
  'online',
  NOW(),
  'SpeedReport Edge Engine',
  'https://speedreport.org/api/meta'
) ON CONFLICT (node_id) DO UPDATE SET
  status = 'online',
  last_heartbeat = NOW();

-- 3. ISP Telemetry Aggregation RPC
CREATE OR REPLACE FUNCTION public.get_speedreport_telemetry_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'total_tests_completed', COALESCE(COUNT(*), 0),
    'avg_download_mbps', COALESCE(ROUND(AVG((metadata->>'download_mbps')::numeric), 2), 0),
    'avg_upload_mbps', COALESCE(ROUND(AVG((metadata->>'upload_mbps')::numeric), 2), 0),
    'avg_ping_ms', COALESCE(ROUND(AVG((metadata->>'ping_ms')::numeric), 2), 0),
    'avg_jitter_ms', COALESCE(ROUND(AVG((metadata->>'jitter_ms')::numeric), 2), 0),
    'top_isps', COALESCE((
      SELECT jsonb_agg(isp_data)
      FROM (
        SELECT
          metadata->>'isp' as isp_name,
          COUNT(*) as test_count,
          ROUND(AVG((metadata->>'download_mbps')::numeric), 1) as avg_download,
          ROUND(AVG((metadata->>'upload_mbps')::numeric), 1) as avg_upload
        FROM public.telemetry_events
        WHERE app_id = 'speedreport'
          AND event_type = 'speed_test_completed'
          AND metadata->>'isp' IS NOT NULL
        GROUP BY metadata->>'isp'
        ORDER BY test_count DESC
        LIMIT 5
      ) isp_data
    ), '[]'::jsonb)
  ) INTO result
  FROM public.telemetry_events
  WHERE app_id = 'speedreport'
    AND event_type = 'speed_test_completed';

  RETURN result;
END;
$$;
