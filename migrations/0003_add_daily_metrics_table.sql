CREATE TABLE IF NOT EXISTS daily_metrics (
    id SERIAL PRIMARY KEY,
    metric_date DATE NOT NULL UNIQUE,
    new_contacts_count INT DEFAULT 0,
    new_events_count INT DEFAULT 0,
    ai_interactions_count INT DEFAULT 0,
    workflow_executions_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Optional: Add a comment to describe the table's purpose
COMMENT ON TABLE daily_metrics IS 'Stores aggregated daily metrics for performance tracking and analysis.';