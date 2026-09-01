-- Create an RPC to trigger pg_notify from Supabase Edge Functions
CREATE OR REPLACE FUNCTION pg_notify_rpc(channel text, payload text) RETURNS void AS $$
BEGIN
  PERFORM pg_notify(channel, payload);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
