ALTER TABLE IF EXISTS satellite_job_queue ADD COLUMN IF NOT EXISTS task_type VARCHAR;

CREATE OR REPLACE FUNCTION dequeue_satellite_jobs(max_jobs INTEGER)
RETURNS SETOF satellite_job_queue
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  UPDATE satellite_job_queue
  SET status = 'processing',
      updated_at = NOW()
  WHERE id IN (
    SELECT id
    FROM satellite_job_queue
    WHERE status = 'pending' OR (status = 'failed' AND attempts < max_attempts)
    ORDER BY created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT max_jobs
  )
  RETURNING *;
END;
$$;
