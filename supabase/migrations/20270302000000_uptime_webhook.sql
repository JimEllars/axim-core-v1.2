-- Create Extension pg_net if not already created
CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";

-- Function to trigger the onyx sentinel Edge Function
CREATE OR REPLACE FUNCTION trigger_onyx_sentinel()
RETURNS trigger AS $$
DECLARE
  payload json;
  request_id bigint;
BEGIN
  -- Only trigger on 'ECOSYSTEM_NODE_DOWN' events
  IF NEW.event = 'ECOSYSTEM_NODE_DOWN' THEN
    payload := row_to_json(NEW);

    -- Standard http_post using pg_net to the internal kong router
    SELECT net.http_post(
        url:='http://kong:8000/functions/v1/onyx-sentinel',
        body:=jsonb_build_object('record', payload),
        headers:=jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', current_setting('request.jwt.claim.role', true) -- Using a placeholder, in real scenario we'd need to pass a token or use internal auth
        )
    ) INTO request_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create Trigger on telemetry_logs
DROP TRIGGER IF EXISTS telemetry_logs_sentinel_trigger ON telemetry_logs;

CREATE TRIGGER telemetry_logs_sentinel_trigger
AFTER INSERT ON telemetry_logs
FOR EACH ROW
EXECUTE FUNCTION trigger_onyx_sentinel();
