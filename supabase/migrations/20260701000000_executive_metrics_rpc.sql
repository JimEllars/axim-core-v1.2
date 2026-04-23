-- Migration to create the get_executive_metrics RPC

CREATE OR REPLACE FUNCTION get_executive_metrics()
RETURNS json
LANGUAGE plpgsql
AS $$
DECLARE
  funnel_starts INT;
  successful_generations INT;
  conversion_rate NUMERIC;
  total_errors INT;
  result json;
BEGIN
  -- Aggregate total funnel starts
  SELECT count(*) INTO funnel_starts
  FROM telemetry_logs
  WHERE created_at >= NOW() - INTERVAL '7 days'
    AND event = 'nda_funnel_started';

  -- Aggregate total successful generations
  SELECT count(*) INTO successful_generations
  FROM telemetry_logs
  WHERE created_at >= NOW() - INTERVAL '7 days'
    AND event = 'document_generated';

  -- Calculate conversion rate (percentage)
  IF funnel_starts > 0 THEN
    conversion_rate := ROUND((successful_generations::NUMERIC / funnel_starts::NUMERIC) * 100, 2);
  ELSE
    conversion_rate := 0.00;
  END IF;

  -- Aggregate total 500/502 errors
  SELECT count(*) INTO total_errors
  FROM telemetry_logs
  WHERE created_at >= NOW() - INTERVAL '7 days'
    AND status_code IN (500, 502);

  -- Build JSON payload
  result := json_build_object(
    'total_funnel_starts', funnel_starts,
    'total_successful_generations', successful_generations,
    'conversion_rate_percentage', conversion_rate,
    'total_errors', total_errors
  );

  RETURN result;
END;
$$;
