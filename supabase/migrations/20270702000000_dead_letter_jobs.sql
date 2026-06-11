CREATE TABLE IF NOT EXISTS public.dead_letter_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    original_job_id UUID NOT NULL,
    app_id VARCHAR,
    task_type VARCHAR,
    payload JSONB,
    target_destination VARCHAR,
    error_log TEXT,
    status TEXT DEFAULT 'Pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.dead_letter_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin access Dead Letter Jobs" ON public.dead_letter_jobs
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid() AND role = 'admin'
        )
    );

ALTER TABLE IF EXISTS satellite_job_queue ADD COLUMN IF NOT EXISTS next_run_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

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
    WHERE (status = 'pending' OR (status = 'failed' AND attempts < max_attempts))
      AND next_run_at <= NOW()
    ORDER BY created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT max_jobs
  )
  RETURNING *;
END;
$$;
