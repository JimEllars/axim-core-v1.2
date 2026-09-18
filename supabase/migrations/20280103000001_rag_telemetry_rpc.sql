-- Migration for RAG Telemetry aggregation
CREATE OR REPLACE FUNCTION get_rag_telemetry_over_time()
RETURNS TABLE(date TEXT, count BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT
    to_char(created_at, 'YYYY-MM-DD') AS date,
    COUNT(id)
  FROM
    api_usage_logs
  WHERE
    endpoint = 'document-qa'
    AND (metadata->>'action' = 'rag_query_executed' OR metadata->>'action' = 'rag_query_failed')
  GROUP BY
    date
  ORDER BY
    date
  LIMIT 7;
END;
$$ LANGUAGE plpgsql;
