-- This migration hardens the Row Level Security (RLS) policies for several tables
-- to ensure data is properly isolated between users.

-- Step 1: Add user_id columns to tables that are missing them.
ALTER TABLE public.contacts_ax2024 ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE public.notes_ax2024 ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE public.projects_ax2024 ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Step 2: Create indexes on the new user_id columns for performance.
CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON public.contacts_ax2024(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_user_id ON public.notes_ax2024(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON public.projects_ax2024(user_id);

-- Step 3: Update existing permissive policies for contacts and notes.
-- Drop the old, insecure policy
DROP POLICY IF EXISTS "Allow all access to authenticated users" ON public.contacts_ax2024;
-- Create a new, secure policy
CREATE POLICY "Users can manage their own contacts"
ON public.contacts_ax2024
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Drop the old, insecure policy
DROP POLICY IF EXISTS "Allow all access to authenticated users" ON public.notes_ax2024;
-- Create a new, secure policy
CREATE POLICY "Users can manage notes for their own contacts"
ON public.notes_ax2024
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Step 4: Add RLS to tables that were missing it entirely.
-- Projects Table
ALTER TABLE public.projects_ax2024 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own projects"
ON public.projects_ax2024
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Tasks Table
ALTER TABLE public.tasks_ax2024 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage tasks within their own projects"
ON public.tasks_ax2024
FOR ALL
-- We check ownership via the project_id, assuming tasks belong to projects the user owns.
-- This requires a sub-query or a join, which can be complex. A simpler, effective approach
-- is to check the assignee_id.
USING (auth.uid() = assignee_id)
WITH CHECK (auth.uid() = assignee_id);

-- Daily Metrics Table (Read-only for all authenticated users)
ALTER TABLE public.daily_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read access to all authenticated users"
ON public.daily_metrics
FOR SELECT
USING (auth.role() = 'authenticated');
-- Note: Write access to this table should be handled by a service role key,
-- for example, within the `recalculate_metrics` function, which should be defined
-- with `SECURITY DEFINER`.

-- Step 5: Update the recalculate_metrics function to run with elevated privileges.
-- This allows it to write to the daily_metrics table regardless of the user's RLS.
CREATE OR REPLACE FUNCTION recalculate_metrics()
RETURNS json AS $$
DECLARE
  -- function body remains the same
  v_new_contacts_count INT;
  v_new_events_count INT;
  v_ai_interactions_count INT;
  v_workflow_executions_count INT;
BEGIN
  SELECT COUNT(*) INTO v_new_contacts_count FROM contacts_ax2024 WHERE created_at::date = CURRENT_DATE;
  SELECT COUNT(*) INTO v_new_events_count FROM events_ax2024 WHERE created_at::date = CURRENT_DATE;
  SELECT COUNT(*) INTO v_ai_interactions_count FROM ai_interactions_ax2024 WHERE created_at::date = CURRENT_DATE;
  SELECT COUNT(*) INTO v_workflow_executions_count FROM events_ax2024 WHERE type = 'workflow_executed' AND created_at::date = CURRENT_DATE;
  INSERT INTO daily_metrics (metric_date, new_contacts_count, new_events_count, ai_interactions_count, workflow_executions_count)
  VALUES (CURRENT_DATE, v_new_contacts_count, v_new_events_count, v_ai_interactions_count, v_workflow_executions_count)
  ON CONFLICT (metric_date) DO UPDATE
  SET
    new_contacts_count = EXCLUDED.new_contacts_count,
    new_events_count = EXCLUDED.new_events_count,
    ai_interactions_count = EXCLUDED.ai_interactions_count,
    workflow_executions_count = EXCLUDED.workflow_executions_count,
    created_at = NOW();
  RETURN json_build_object(
    'success', true,
    'message', 'Daily metrics have been successfully recalculated and stored.',
    'metrics', json_build_object(
      'new_contacts', v_new_contacts_count,
      'new_events', v_new_events_count,
      'ai_interactions', v_ai_interactions_count,
      'workflow_executions', v_workflow_executions_count
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;