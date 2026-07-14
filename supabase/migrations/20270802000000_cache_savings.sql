CREATE OR REPLACE FUNCTION get_dashboard_metrics()
RETURNS TABLE(
  total_contacts BIGINT,
  new_today BIGINT,
  active_events BIGINT,
  ai_interactions BIGINT,
  contact_change NUMERIC,
  workflows_triggered BIGINT,
  active_users BIGINT,
  cache_savings NUMERIC
) AS $$
DECLARE
  yesterday_contacts BIGINT;
  total_cache_hits BIGINT;
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

  RETURN QUERY SELECT
    total_contacts,
    new_today,
    active_events,
    ai_interactions,
    contact_change,
    workflows_triggered,
    active_users,
    cache_savings;
END;
$$ LANGUAGE plpgsql;
