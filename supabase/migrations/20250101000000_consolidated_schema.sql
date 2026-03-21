-- Consolidated Schema Migration for Supabase

-- Base Setup (from setup.sql)

-- This function is no longer recommended for RLS.
-- It is kept for historical reference but is not used in the new policies.
CREATE OR REPLACE FUNCTION get_my_claim(claim TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN (current_setting('request.jwt.claims', true)::jsonb ->> claim);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create user roles
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM ('admin', 'user');
    END IF;
END$$;

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role user_role NOT NULL DEFAULT 'user'
);
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Create contacts table
CREATE TABLE IF NOT EXISTS contacts_ax2024 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    source TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    user_id UUID REFERENCES auth.users(id)
);
ALTER TABLE contacts_ax2024 ENABLE ROW LEVEL SECURITY;

-- Create events table
CREATE TABLE IF NOT EXISTS events_ax2024 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL,
    source TEXT,
    data JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    user_id UUID REFERENCES auth.users(id) -- Added user_id for RLS/multi-tenancy if missing
);
ALTER TABLE events_ax2024 ENABLE ROW LEVEL SECURITY;

-- Create AI interactions table
CREATE TABLE IF NOT EXISTS ai_interactions_ax2024 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    command TEXT NOT NULL,
    response TEXT,
    execution_time_ms INTEGER,
    status TEXT,
    command_type TEXT,
    llm_provider TEXT,
    llm_model TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    user_id UUID REFERENCES auth.users(id),
    conversation_id UUID
);
ALTER TABLE ai_interactions_ax2024 ENABLE ROW LEVEL SECURITY;

-- Create API integrations table
CREATE TABLE IF NOT EXISTS api_integrations_ax2024 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    status TEXT DEFAULT 'inactive',
    base_url TEXT,
    auth_type TEXT DEFAULT 'api_key',
    metadata JSONB,
    endpoints JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    user_id UUID REFERENCES auth.users(id) -- Added user_id for RLS
);
ALTER TABLE api_integrations_ax2024 ENABLE ROW LEVEL SECURITY;

-- Create API call logs table
CREATE TABLE IF NOT EXISTS api_call_logs_ax2024 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    integration_id UUID REFERENCES api_integrations_ax2024(id) ON DELETE CASCADE,
    endpoint TEXT,
    method TEXT,
    status_code INTEGER,
    response_time_ms INTEGER,
    success BOOLEAN,
    triggered_by TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE api_call_logs_ax2024 ENABLE ROW LEVEL SECURITY;

-- Create workflows table
CREATE TABLE IF NOT EXISTS workflows_ax2024 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    slug TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT now(),
    user_id UUID REFERENCES auth.users(id) -- Added user_id
);
ALTER TABLE workflows_ax2024 ENABLE ROW LEVEL SECURITY;

-- Create projects table
CREATE TABLE IF NOT EXISTS projects_ax2024 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    user_id UUID REFERENCES auth.users(id)
);
ALTER TABLE projects_ax2024 ENABLE ROW LEVEL SECURITY;

-- Create tasks table
CREATE TABLE IF NOT EXISTS tasks_ax2024 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects_ax2024(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    assignee_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    user_id UUID REFERENCES auth.users(id) -- Added user_id
);
ALTER TABLE tasks_ax2024 ENABLE ROW LEVEL SECURITY;

-- Create daily metrics table
CREATE TABLE IF NOT EXISTS daily_metrics (
    id SERIAL PRIMARY KEY,
    metric_date DATE NOT NULL UNIQUE,
    new_contacts_count INT DEFAULT 0,
    new_events_count INT DEFAULT 0,
    ai_interactions_count INT DEFAULT 0,
    workflow_executions_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE daily_metrics IS 'Stores aggregated daily metrics for performance tracking and analysis.';

-- Create API Keys table (from migrations/0001)
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    service TEXT NOT NULL,
    api_key TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, service)
);
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- Create Scheduled Tasks table (from migrations/0010)
CREATE TABLE IF NOT EXISTS scheduled_tasks (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    command TEXT NOT NULL,
    schedule TEXT NOT NULL, -- Using CRON format
    status TEXT NOT NULL DEFAULT 'active', -- e.g., 'active', 'paused', 'completed'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_user_id ON scheduled_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_status ON scheduled_tasks(status);
CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_next_run_at ON scheduled_tasks(next_run_at);
ALTER TABLE scheduled_tasks ENABLE ROW LEVEL SECURITY;

-- Create Devices table (from migrations/20251026101224)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'device_status') THEN
        CREATE TYPE device_status AS ENUM ('online', 'offline', 'busy');
    END IF;
END$$;

CREATE TABLE IF NOT EXISTS public.devices (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    device_name text NOT NULL,
    system_info jsonb NULL,
    status device_status NOT NULL DEFAULT 'offline'::device_status,
    last_seen timestamp with time zone NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT devices_pkey PRIMARY KEY (id),
    CONSTRAINT devices_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;

-- Drop old policies if they exist (to ensure fresh start)
DROP POLICY IF EXISTS "Allow admins full access" ON public.users;
DROP POLICY IF EXISTS "Allow users to view their own data" ON public.users;
DROP POLICY IF EXISTS "Allow full access to admins" ON public.contacts_ax2024;
DROP POLICY IF EXISTS "Allow access to own contacts for users" ON public.contacts_ax2024;
DROP POLICY IF EXISTS "Allow full access to admins" ON public.events_ax2024;
DROP POLICY IF EXISTS "Allow read access to all users" ON public.events_ax2024;
DROP POLICY IF EXISTS "Allow full access to admins" ON public.ai_interactions_ax2024;
DROP POLICY IF EXISTS "Allow access to own interactions for users" ON public.ai_interactions_ax2024;
DROP POLICY IF EXISTS "Allow full access to admins" ON public.api_integrations_ax2024;
DROP POLICY IF EXISTS "Allow read access to all users" ON public.api_integrations_ax2024;
DROP POLICY IF EXISTS "Allow full access to admins" ON public.api_call_logs_ax2024;
DROP POLICY IF EXISTS "Allow read access to all users" ON public.api_call_logs_ax2024;
DROP POLICY IF EXISTS "Allow full access to admins" ON public.workflows_ax2024;
DROP POLICY IF EXISTS "Allow read access to all users" ON public.workflows_ax2024;
DROP POLICY IF EXISTS "Allow full access to admins" ON public.projects_ax2024;
DROP POLICY IF EXISTS "Allow access to own projects for users" ON public.projects_ax2024;
DROP POLICY IF EXISTS "Allow full access to admins on tasks" ON public.tasks_ax2024;
DROP POLICY IF EXISTS "Allow users to see tasks on their projects" ON public.tasks_ax2024;
DROP POLICY IF EXISTS "Allow users to manage their own API keys" ON public.api_keys;
DROP POLICY IF EXISTS "Allow users to see their own devices" ON public.devices;
DROP POLICY IF EXISTS "Allow users to insert their own devices" ON public.devices;
DROP POLICY IF EXISTS "Allow users to update their own devices" ON public.devices;
DROP POLICY IF EXISTS "Allow users to delete their own devices" ON public.devices;

-- Create Policies

-- Users
CREATE POLICY "Allow admins full access" ON public.users FOR ALL
  USING ((SELECT role FROM public.users WHERE id = auth.uid()) = 'admin');
CREATE POLICY "Allow users to view their own data" ON public.users FOR SELECT
  USING (auth.uid() = id);

-- Contacts
CREATE POLICY "Allow full access to admins" ON public.contacts_ax2024 FOR ALL
  USING ((SELECT role FROM public.users WHERE id = auth.uid()) = 'admin');
CREATE POLICY "Allow access to own contacts for users" ON public.contacts_ax2024 FOR ALL
  USING (user_id = auth.uid());

-- Events
CREATE POLICY "Allow full access to admins" ON public.events_ax2024 FOR ALL
  USING ((SELECT role FROM public.users WHERE id = auth.uid()) = 'admin');
CREATE POLICY "Allow read access to all users for events" ON public.events_ax2024 FOR SELECT
  USING (true); -- Maybe restrict to user_id? But setup.sql allowed all users. Let's keep it but ideally restrict.
-- Ideally: USING (user_id = auth.uid() OR (SELECT role FROM public.users WHERE id = auth.uid()) = 'admin');

-- AI Interactions
CREATE POLICY "Allow full access to admins" ON public.ai_interactions_ax2024 FOR ALL
  USING ((SELECT role FROM public.users WHERE id = auth.uid()) = 'admin');
CREATE POLICY "Allow access to own interactions for users" ON public.ai_interactions_ax2024 FOR ALL
  USING (user_id = auth.uid());

-- API Integrations
CREATE POLICY "Allow full access to admins" ON public.api_integrations_ax2024 FOR ALL
  USING ((SELECT role FROM public.users WHERE id = auth.uid()) = 'admin');
CREATE POLICY "Allow read access to all users for api integrations" ON public.api_integrations_ax2024 FOR SELECT
  USING (true);

-- API Call Logs
CREATE POLICY "Allow full access to admins" ON public.api_call_logs_ax2024 FOR ALL
  USING ((SELECT role FROM public.users WHERE id = auth.uid()) = 'admin');
CREATE POLICY "Allow read access to all users for api call logs" ON public.api_call_logs_ax2024 FOR SELECT
  USING (true);

-- Workflows
CREATE POLICY "Allow full access to admins" ON public.workflows_ax2024 FOR ALL
  USING ((SELECT role FROM public.users WHERE id = auth.uid()) = 'admin');
CREATE POLICY "Allow read access to all users for workflows" ON public.workflows_ax2024 FOR SELECT
  USING (true);

-- Projects
CREATE POLICY "Allow full access to admins" ON public.projects_ax2024 FOR ALL
  USING ((SELECT role FROM public.users WHERE id = auth.uid()) = 'admin');
CREATE POLICY "Allow access to own projects for users" ON public.projects_ax2024 FOR ALL
  USING (user_id = auth.uid());

-- Tasks
CREATE POLICY "Allow full access to admins on tasks" ON public.tasks_ax2024 FOR ALL
  USING ((SELECT role FROM public.users WHERE id = auth.uid()) = 'admin');
CREATE POLICY "Allow users to see tasks on their projects" ON public.tasks_ax2024 FOR SELECT
  USING (EXISTS (SELECT 1 FROM projects_ax2024 p WHERE p.id = tasks_ax2024.project_id AND p.user_id = auth.uid()));

-- API Keys
CREATE POLICY "Allow users to manage their own API keys" ON public.api_keys FOR ALL
  USING (auth.uid() = user_id);

-- Scheduled Tasks
CREATE POLICY "Allow users to manage their own scheduled tasks" ON scheduled_tasks FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Devices
CREATE POLICY "Allow users to see their own devices" ON public.devices FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Allow users to insert their own devices" ON public.devices FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Allow users to update their own devices" ON public.devices FOR UPDATE
  USING (auth.uid() = user_id);
CREATE POLICY "Allow users to delete their own devices" ON public.devices FOR DELETE
  USING (auth.uid() = user_id);


-- Functions

CREATE OR REPLACE FUNCTION get_contacts_by_source()
RETURNS TABLE(source TEXT, count BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.source,
    COUNT(c.id)
  FROM
    contacts_ax2024 c
  JOIN (
    SELECT DISTINCT source FROM contacts_ax2024
  ) s ON c.source = s.source
  GROUP BY
    s.source;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_ai_interactions_over_time()
RETURNS TABLE(date TEXT, count BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT
    to_char(created_at, 'YYYY-MM-DD') AS date,
    COUNT(id)
  FROM
    ai_interactions_ax2024
  GROUP BY
    date
  ORDER BY
    date;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_events_by_type()
RETURNS TABLE(type TEXT, count BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.type,
    COUNT(e.id)
  FROM
    events_ax2024 e
  GROUP BY
    e.type;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_api_call_summary()
RETURNS TABLE(total_calls BIGINT, success_rate FLOAT) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(id) AS total_calls,
    (COUNT(CASE WHEN success THEN 1 END) * 100.0 / COUNT(id)) AS success_rate
  FROM
    api_call_logs_ax2024;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_all_users()
RETURNS TABLE(id UUID, email TEXT, role user_role, created_at TIMESTAMPTZ) AS $$
BEGIN
  -- Check if the user is an admin
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Access Denied: Only admins can view all users.';
  END IF;

  RETURN QUERY
  SELECT u.id, u.email, pu.role, u.created_at
  FROM auth.users u
  JOIN public.users pu ON u.id = pu.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION delete_a_user(user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if the user is an admin
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Access Denied: Only admins can delete users.';
  END IF;

  DELETE FROM auth.users WHERE id = user_id;
END;
$$;

CREATE OR REPLACE FUNCTION recalculate_metrics()
RETURNS json AS $$
DECLARE
  v_new_contacts_count INT;
  v_new_events_count INT;
  v_ai_interactions_count INT;
  v_workflow_executions_count INT;
BEGIN
  -- Calculate metrics for the current day
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
$$ LANGUAGE plpgsql;

-- get_dashboard_metrics (Modified to use events_ax2024)
CREATE OR REPLACE FUNCTION get_dashboard_metrics()
RETURNS TABLE(
  total_contacts BIGINT,
  new_today BIGINT,
  active_events BIGINT,
  ai_interactions BIGINT,
  contact_change NUMERIC,
  workflows_triggered BIGINT,
  active_users BIGINT
) AS $$
DECLARE
  yesterday_contacts BIGINT;
BEGIN
  -- Get total contacts
  SELECT COUNT(*) INTO total_contacts FROM contacts_ax2024;

  -- Get contacts created today
  SELECT COUNT(*) INTO new_today FROM contacts_ax2024 WHERE DATE(created_at) = CURRENT_DATE;

  -- Get active system events (e.g., in the last 24 hours)
  SELECT COUNT(*) INTO active_events FROM events_ax2024 WHERE created_at >= NOW() - INTERVAL '24 hours';

  -- Get total AI interactions
  SELECT COUNT(*) INTO ai_interactions FROM ai_interactions_ax2024;

  -- Get total workflows triggered (from events_ax2024)
  SELECT COUNT(*) INTO workflows_triggered FROM events_ax2024 WHERE type = 'workflow_executed';

  -- Get active users (e.g., in the last 24 hours)
  SELECT COUNT(DISTINCT user_id) INTO active_users FROM events_ax2024 WHERE created_at >= NOW() - INTERVAL '24 hours';

  -- Calculate percentage change in contacts from yesterday
  SELECT COUNT(*) INTO yesterday_contacts FROM contacts_ax2024 WHERE DATE(created_at) < CURRENT_DATE;

  IF yesterday_contacts > 0 THEN
    contact_change := (total_contacts - yesterday_contacts)::NUMERIC * 100 / yesterday_contacts;
  ELSE
    contact_change := 100.0;
  END IF;

  RETURN QUERY SELECT
    total_contacts,
    new_today,
    active_events,
    ai_interactions,
    contact_change,
    workflows_triggered,
    active_users;
END;
$$ LANGUAGE plpgsql;

-- get_configured_providers (from migrations/0009)
CREATE OR REPLACE FUNCTION get_configured_providers()
RETURNS TABLE(service TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT T.service
  FROM public.api_keys AS T
  WHERE T.api_key IS NOT NULL AND T.api_key <> '';
END;
$$ LANGUAGE plpgsql;

-- search_chat_history (from migrations/20251027)
CREATE OR REPLACE FUNCTION search_chat_history(query_text TEXT)
RETURNS TABLE (
    command TEXT,
    response TEXT,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        ai.command,
        ai.response,
        ai.created_at
    FROM
        ai_interactions_ax2024 ai
    WHERE
        ai.user_id = auth.uid()
        AND (
            ai.command ILIKE '%' || query_text || '%'
            OR ai.response ILIKE '%' || query_text || '%'
        )
    ORDER BY
        ai.created_at DESC
    LIMIT 20;
END;
$$;

-- get_recent_workflow_runs (New function)
CREATE OR REPLACE FUNCTION get_recent_workflow_runs()
RETURNS TABLE (
    created_at TIMESTAMPTZ,
    data JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        e.created_at,
        e.data
    FROM
        events_ax2024 e
    WHERE
        e.type = 'workflow_executed'
    ORDER BY
        e.created_at DESC
    LIMIT 5;
END;
$$;
