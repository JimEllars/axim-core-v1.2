-- Create the projects table
CREATE TABLE IF NOT EXISTS projects_ax2024 (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE projects_ax2024 IS 'Stores project information for the ForemanOS Quick-Start workflow.';

-- Create the tasks table
CREATE TABLE IF NOT EXISTS tasks_ax2024 (
    id SERIAL PRIMARY KEY,
    project_id INT NOT NULL REFERENCES projects_ax2024(id) ON DELETE CASCADE,
    assignee_id UUID REFERENCES auth.users(id), -- Assuming user IDs are from Supabase Auth
    title VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE tasks_ax2024 IS 'Stores tasks associated with projects, assigned to users.';

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks_ax2024(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee_id ON tasks_ax2024(assignee_id);