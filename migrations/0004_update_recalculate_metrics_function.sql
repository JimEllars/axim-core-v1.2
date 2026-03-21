CREATE OR REPLACE FUNCTION recalculate_metrics()
RETURNS json AS $$
DECLARE
  v_new_contacts_count INT;
  v_new_events_count INT;
  v_ai_interactions_count INT;
  v_workflow_executions_count INT;
BEGIN
  -- Calculate metrics for the current day
  SELECT COUNT(*) INTO v_new_contacts_count FROM contacts_ax2024 WHERE created_at::date = CURRENT_DATE;
  SELECT COUNT(*) INTO v_new_events_count FROM events_ax2024 WHERE created_at::date = CURRENT_DATE;
  SELECT COUNT(*) INTO v_ai_interactions_count FROM ai_interactions_ax2024 WHERE created_at::date = CURRENT_DATE;
  SELECT COUNT(*) INTO v_workflow_executions_count FROM events_ax2024 WHERE type = 'workflow_executed' AND created_at::date = CURRENT_DATE;

  -- Upsert the calculated metrics into the daily_metrics table
  INSERT INTO daily_metrics (metric_date, new_contacts_count, new_events_count, ai_interactions_count, workflow_executions_count)
  VALUES (CURRENT_DATE, v_new_contacts_count, v_new_events_count, v_ai_interactions_count, v_workflow_executions_count)
  ON CONFLICT (metric_date) DO UPDATE
  SET
    new_contacts_count = EXCLUDED.new_contacts_count,
    new_events_count = EXCLUDED.new_events_count,
    ai_interactions_count = EXCLUDED.ai_interactions_count,
    workflow_executions_count = EXCLUDED.workflow_executions_count,
    created_at = NOW();

  -- Return a success message with the calculated metrics
  RETURN json_build_object(
    'success', true,
    'message', 'Daily metrics have been successfully recalculated and stored.',
    'metrics', json_build_object(
      'new_contacts', v_new_contacts_count,
      'new_events', v_new_events_count,
      'ai_interactions', v_ai_interactions_count,
      'workflow_executions', v_workflow_executions_count
    )
  );
END;
$$ LANGUAGE plpgsql;