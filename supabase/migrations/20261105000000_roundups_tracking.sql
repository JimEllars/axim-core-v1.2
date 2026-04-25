CREATE TYPE roundup_status AS ENUM ('pending', 'generating', 'completed', 'timeout', 'failed');

CREATE TABLE roundups_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    remote_roundup_id TEXT,
    headline TEXT,
    status roundup_status NOT NULL DEFAULT 'pending',
    article_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE roundups_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service Role Only" ON roundups_jobs
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
