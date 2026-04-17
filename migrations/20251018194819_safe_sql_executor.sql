CREATE OR REPLACE FUNCTION safe_sql_executor(query text)
RETURNS json AS $$
DECLARE
    result json;
BEGIN
    -- Enforce read-only mode to prevent any data modification
    SET LOCAL transaction_read_only = on;

    -- Basic check for SELECT-like queries
    IF NOT (lower(trim(query)) LIKE 'select%' OR lower(trim(query)) LIKE 'with%') THEN
        RETURN json_build_object('error', 'Only SELECT and WITH (read-only) queries are allowed.');
    END IF;

    -- Execute the user-provided query safely wrapped in json_agg
    BEGIN
        EXECUTE 'SELECT json_agg(t) FROM (' || query || ') t' INTO result;
        RETURN result;
    EXCEPTION WHEN others THEN
        RETURN json_build_object('error', 'Query execution failed: ' || SQLERRM);
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
