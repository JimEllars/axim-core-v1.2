-- 1. Ensure the schema of api_usage_logs can store micro-app telemetry data
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'api_usage_logs' AND column_name = 'app_id') THEN
        ALTER TABLE public.api_usage_logs ADD COLUMN app_id VARCHAR(50);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'api_usage_logs' AND column_name = 'method') THEN
        ALTER TABLE public.api_usage_logs ADD COLUMN method VARCHAR(10);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'api_usage_logs' AND column_name = 'token_count') THEN
        ALTER TABLE public.api_usage_logs ADD COLUMN token_count INTEGER;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'api_usage_logs' AND column_name = 'error_message') THEN
        ALTER TABLE public.api_usage_logs ADD COLUMN error_message TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'api_usage_logs' AND column_name = 'metadata') THEN
        ALTER TABLE public.api_usage_logs ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb;
    END IF;
END $$;

-- 2. Modify the get_dashboard_metrics RPC to return micro_app_metrics as well.
-- Since the old get_dashboard_metrics returned a TABLE with specific columns, we need to add the new column.
DROP FUNCTION IF EXISTS get_dashboard_metrics();

CREATE OR REPLACE FUNCTION get_dashboard_metrics()
RETURNS TABLE(
  total_contacts BIGINT,
  new_today BIGINT,
  active_events BIGINT,
  ai_interactions BIGINT,
  contact_change NUMERIC,
  workflows_triggered BIGINT,
  active_users BIGINT,
  cache_savings NUMERIC,
  micro_app_metrics JSONB
) AS $$
DECLARE
  yesterday_contacts BIGINT;
  total_cache_hits BIGINT;
  v_micro_app_metrics JSONB;
BEGIN
  -- Get total contacts
  SELECT COUNT(*) INTO total_contacts FROM contacts_ax2024;

  -- Get contacts created today
  SELECT COUNT(*) INTO new_today FROM contacts_ax2024 WHERE DATE(created_at) = CURRENT_DATE;

  -- Get active system events (e.g., in the last 24 hours)
  SELECT COUNT(*) INTO active_events FROM events_ax2024 WHERE created_at >= NOW() - INTERVAL '24 hours';

  -- Get total AI interactions
  SELECT COUNT(*) INTO ai_interactions FROM ai_interactions_ax2024;

  -- Get total workflows triggered (from events_ax2024)
  SELECT COUNT(*) INTO workflows_triggered FROM events_ax2024 WHERE type = 'workflow_executed';

  -- Get active users (e.g., in the last 24 hours)
  SELECT COUNT(DISTINCT user_id) INTO active_users FROM events_ax2024 WHERE created_at >= NOW() - INTERVAL '24 hours';

  -- Calculate percentage change in contacts from yesterday
  SELECT COUNT(*) INTO yesterday_contacts FROM contacts_ax2024 WHERE DATE(created_at) < CURRENT_DATE;

  IF yesterday_contacts > 0 THEN
    contact_change := (total_contacts - yesterday_contacts)::NUMERIC * 100 / yesterday_contacts;
  ELSE
    contact_change := 100.0;
  END IF;

  -- Calculate cache savings percentage based on metadata->'cached'
  SELECT COUNT(*) INTO total_cache_hits FROM ai_interactions_ax2024 WHERE metadata->>'cached' = 'true';
  IF ai_interactions > 0 THEN
    cache_savings := (total_cache_hits::NUMERIC / ai_interactions::NUMERIC) * 100;
  ELSE
    cache_savings := 0.0;
  END IF;

  -- Aggregate micro_app_metrics from api_usage_logs
  -- We aggregate by app_id to get averages, counts, etc.
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'app_id', app_id,
      'total_requests', total_reqs,
      'avg_execution_time_ms', avg_exec_time,
      'avg_compute_ms', avg_compute,
      'total_tokens', total_tokens,
      'error_count', errors
    )
  ), '[]'::jsonb) INTO v_micro_app_metrics
  FROM (
    SELECT
      COALESCE(app_id, 'unknown') as app_id,
      COUNT(*) as total_reqs,
      ROUND(AVG(COALESCE(execution_time_ms, 0))) as avg_exec_time,
      ROUND(AVG(COALESCE(compute_ms, 0))) as avg_compute,
      SUM(COALESCE(token_count, 0)) as total_tokens,
      COUNT(CASE WHEN status_code >= 400 THEN 1 END) as errors
    FROM public.api_usage_logs
    GROUP BY COALESCE(app_id, 'unknown')
  ) subq;

  RETURN QUERY SELECT
    total_contacts,
    new_today,
    active_events,
    ai_interactions,
    contact_change,
    workflows_triggered,
    active_users,
    cache_savings,
    v_micro_app_metrics;
END;
$$ LANGUAGE plpgsql;
