-- Create Extension pg_net if not already created
CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";

-- Function to trigger the auto-healer Edge Function
CREATE OR REPLACE FUNCTION trigger_auto_healer()
RETURNS trigger AS $$
DECLARE
  payload json;
  request_id bigint;
BEGIN
  -- Only trigger on 'uptime_failure' events
  IF NEW.event = 'uptime_failure' THEN
    payload := row_to_json(NEW);

    -- Standard http_post using pg_net to the internal kong router
    SELECT net.http_post(
        url:='http://kong:8000/functions/v1/auto-healer',
        body:=jsonb_build_object('record', payload),
        headers:='{"Content-Type": "application/json"}'::jsonb
    ) INTO request_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create Trigger on telemetry_logs
DROP TRIGGER IF EXISTS telemetry_logs_uptime_trigger ON telemetry_logs;

CREATE TRIGGER telemetry_logs_uptime_trigger
AFTER INSERT ON telemetry_logs
FOR EACH ROW
EXECUTE FUNCTION trigger_auto_healer();
