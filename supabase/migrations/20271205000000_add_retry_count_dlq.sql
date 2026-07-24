ALTER TABLE IF EXISTS public.satellite_job_queue ADD COLUMN IF NOT EXISTS retry_count INT DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.hitl_dead_letter_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    original_job_id UUID NOT NULL,
    app_id VARCHAR,
    task_type VARCHAR,
    payload JSONB,
    error_log TEXT,
    diagnostic_payload JSONB,
    status TEXT DEFAULT 'Pending_HITL_Review',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
