-- migrations/0009_add_get_configured_providers_function.sql

-- This function retrieves a distinct list of service providers
-- for which an API key has been configured in the `api_keys` table.
-- It ensures that only providers with saved credentials appear in the UI.

CREATE OR REPLACE FUNCTION get_configured_providers()
RETURNS TABLE(service TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT T.service
  FROM public.api_keys AS T
  WHERE T.api_key IS NOT NULL AND T.api_key <> '';
END;
$$ LANGUAGE plpgsql;