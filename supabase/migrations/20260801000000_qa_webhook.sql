-- Create log_archives bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('log_archives', 'log_archives', false)
ON CONFLICT (id) DO NOTHING;

-- Extension pg_net should already be available or let's create it just in case
CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";

-- Function to trigger the document-qa Edge Function
CREATE OR REPLACE FUNCTION trigger_document_qa()
RETURNS trigger AS $$
DECLARE
  payload json;
  request_id bigint;
  supabase_url text;
  auth_header text;
BEGIN
  payload := row_to_json(NEW);

  -- Determine Supabase URL (typically available via current_setting if configured, or default localhost for local dev)
  -- For Edge Functions from pg_net, we usually hit the internal kong router or provided URL.
  -- Wait, often there's a convention. A standard HTTP POST.

  -- The requirement says:
  -- "Write a PostgreSQL trigger using pg_net that fires an HTTP POST to your new document-qa Edge Function whenever a new row is inserted into vault_records."

  -- Let's use standard Supabase placeholder url, or we can use http://kong:8000/functions/v1/document-qa which is standard for docker networks.
  -- But often they want a clean setup.

  SELECT net.http_post(
      url:='http://kong:8000/functions/v1/document-qa',
      body:=jsonb_build_object('record', payload),
      headers:='{"Content-Type": "application/json"}'::jsonb
  ) INTO request_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create Trigger on vault_records
DROP TRIGGER IF EXISTS vault_records_qa_trigger ON vault_records;

CREATE TRIGGER vault_records_qa_trigger
AFTER INSERT ON vault_records
FOR EACH ROW
EXECUTE FUNCTION trigger_document_qa();
