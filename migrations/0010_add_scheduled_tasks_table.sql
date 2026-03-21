CREATE TABLE scheduled_tasks (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    command TEXT NOT NULL,
    schedule TEXT NOT NULL, -- Using CRON format
    status TEXT NOT NULL DEFAULT 'active', -- e.g., 'active', 'paused', 'completed'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ
);

-- Indexes for performance
CREATE INDEX idx_scheduled_tasks_user_id ON scheduled_tasks(user_id);
CREATE INDEX idx_scheduled_tasks_status ON scheduled_tasks(status);
CREATE INDEX idx_scheduled_tasks_next_run_at ON scheduled_tasks(next_run_at);

-- RLS Policy
ALTER TABLE scheduled_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own scheduled tasks"
ON scheduled_tasks
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
