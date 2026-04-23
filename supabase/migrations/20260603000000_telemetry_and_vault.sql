CREATE TABLE IF NOT EXISTS public.telemetry_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id TEXT,
    event TEXT NOT NULL,
    app_type TEXT,
    timestamp TIMESTAMPTZ DEFAULT now(),
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS telemetry_logs_timestamp_idx ON public.telemetry_logs (timestamp);

CREATE TABLE IF NOT EXISTS public.vault_records (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    file_name TEXT NOT NULL,
    document_type TEXT,
    trace_id TEXT,
    bucket_id TEXT DEFAULT 'secure_artifacts',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vault_records_trace_id_idx ON public.vault_records (trace_id);
