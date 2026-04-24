-- Migration to update the get_executive_metrics RPC to include external telemetry

CREATE OR REPLACE FUNCTION get_executive_metrics()
RETURNS json
LANGUAGE plpgsql
AS $$
DECLARE
  funnel_starts INT;
  successful_generations INT;
  conversion_rate NUMERIC;
  total_errors INT;
  tabby_revenue_cleared NUMERIC := 0;
  tabby_expenses_logged NUMERIC := 0;
  roundups_articles_published INT := 0;
  roundups_affiliate_clicks INT := 0;
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

  -- Aggregate Tabby revenue cleared (assuming amount is in details JSON)
  SELECT COALESCE(SUM((details->>'amount')::NUMERIC), 0) INTO tabby_revenue_cleared
  FROM telemetry_logs
  WHERE created_at >= NOW() - INTERVAL '7 days'
    AND event = 'revenue_cleared'
    AND app_type = 'tabby-accounting';

  -- Aggregate Tabby expenses logged
  SELECT COALESCE(SUM((details->>'amount')::NUMERIC), 0) INTO tabby_expenses_logged
  FROM telemetry_logs
  WHERE created_at >= NOW() - INTERVAL '7 days'
    AND event = 'expense_logged'
    AND app_type = 'tabby-accounting';

  -- Aggregate RoundUps articles published
  SELECT count(*) INTO roundups_articles_published
  FROM telemetry_logs
  WHERE created_at >= NOW() - INTERVAL '7 days'
    AND event = 'article_published'
    AND app_type = 'roundups-affiliate';

  -- Aggregate RoundUps affiliate clicks
  SELECT count(*) INTO roundups_affiliate_clicks
  FROM telemetry_logs
  WHERE created_at >= NOW() - INTERVAL '7 days'
    AND event = 'affiliate_click'
    AND app_type = 'roundups-affiliate';

  -- Build JSON payload
  result := json_build_object(
    'total_funnel_starts', funnel_starts,
    'total_successful_generations', successful_generations,
    'conversion_rate_percentage', conversion_rate,
    'total_errors', total_errors,
    'tabby_revenue_cleared', tabby_revenue_cleared,
    'tabby_expenses_logged', tabby_expenses_logged,
    'roundups_articles_published', roundups_articles_published,
    'roundups_affiliate_clicks', roundups_affiliate_clicks
  );

  RETURN result;
END;
$$;
