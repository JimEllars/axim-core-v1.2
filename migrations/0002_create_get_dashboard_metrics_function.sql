CREATE OR REPLACE FUNCTION get_dashboard_metrics()
RETURNS TABLE(
  total_contacts BIGINT,
  new_today BIGINT,
  active_events BIGINT,
  ai_interactions BIGINT,
  contact_change NUMERIC,
  workflows_triggered BIGINT,
  active_users BIGINT
) AS $$
DECLARE
  yesterday_contacts BIGINT;
BEGIN
  -- Get total contacts
  SELECT COUNT(*) INTO total_contacts FROM contacts_ax2024;

  -- Get contacts created today
  SELECT COUNT(*) INTO new_today FROM contacts_ax2024 WHERE DATE(created_at) = CURRENT_DATE;

  -- Get active system events (e.g., in the last 24 hours)
  SELECT COUNT(*) INTO active_events FROM events_ax2024 WHERE created_at >= NOW() - INTERVAL '24 hours';

  -- Get total AI interactions
  SELECT COUNT(*) INTO ai_interactions FROM ai_interactions_ax2024;

  -- Get total workflows triggered
  SELECT COUNT(*) INTO workflows_triggered FROM workflow_runs_ax2024;

  -- Get active users (e.g., in the last 24 hours)
  SELECT COUNT(DISTINCT user_id) INTO active_users FROM events_ax2024 WHERE created_at >= NOW() - INTERVAL '24 hours';

  -- Calculate percentage change in contacts from yesterday
  SELECT COUNT(*) INTO yesterday_contacts FROM contacts_ax2024 WHERE DATE(created_at) < CURRENT_DATE;

  IF yesterday_contacts > 0 THEN
    contact_change := (total_contacts - yesterday_contacts)::NUMERIC * 100 / yesterday_contacts;
  ELSE
    contact_change := 100.0; -- Or NULL if you prefer
  END IF;

  RETURN QUERY SELECT
    total_contacts,
    new_today,
    active_events,
    ai_interactions,
    contact_change,
    workflows_triggered,
    active_users;
END;
$$ LANGUAGE plpgsql;
