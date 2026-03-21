CREATE OR REPLACE FUNCTION safe_sql_executor(query text)
RETURNS json AS $$
DECLARE
    result json;
BEGIN
    -- Check if the query is a SELECT statement
    IF lower(query) LIKE 'select%' THEN
        EXECUTE 'SELECT json_agg(t) FROM (' || query || ') t' INTO result;
        RETURN result;
    ELSE
        -- Return an error if the query is not a SELECT statement
        RETURN json_build_object('error', 'Only SELECT statements are allowed.');
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
