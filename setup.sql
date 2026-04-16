-- Axim Core v1.2 - Database Setup Script

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
    created_at TIMESTAMPTZ DEFAULT now()
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
    created_at TIMESTAMPTZ DEFAULT now()
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
    created_at TIMESTAMPTZ DEFAULT now()
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
    created_at TIMESTAMPTZ DEFAULT now()
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

-- Drop old policies if they exist
DROP POLICY IF EXISTS "Allow admins full access" ON public.users;
DROP POLICY IF EXISTS "Allow users to view their own data" ON public.users;
DROP POLICY IF EXISTS "Allow full access to admins" ON public.contacts_ax2024;
DROP POLICY IF EXISTS "Allow access to own contacts for users" ON public.contacts_ax2024;
DROP POLICY IF EXISTS "Allow full access to admins" ON public.events_ax2024;
DROP POLICY IF EXISTS "Allow read access to all users" ON public.events_ax2024;
DROP POLICY IF EXISTS "Allow read access to all users for events" ON public.events_ax2024;
DROP POLICY IF EXISTS "Allow full access to admins" ON public.ai_interactions_ax2024;
DROP POLICY IF EXISTS "Allow access to own interactions for users" ON public.ai_interactions_ax2024;
DROP POLICY IF EXISTS "Allow full access to admins" ON public.api_integrations_ax2024;
DROP POLICY IF EXISTS "Allow read access to all users" ON public.api_integrations_ax2024;
DROP POLICY IF EXISTS "Allow read access to all users for api integrations" ON public.api_integrations_ax2024;
DROP POLICY IF EXISTS "Allow full access to admins" ON public.api_call_logs_ax2024;
DROP POLICY IF EXISTS "Allow read access to all users" ON public.api_call_logs_ax2024;
DROP POLICY IF EXISTS "Allow read access to all users for api call logs" ON public.api_call_logs_ax2024;
DROP POLICY IF EXISTS "Allow full access to admins" ON public.workflows_ax2024;
DROP POLICY IF EXISTS "Allow read access to all users" ON public.workflows_ax2024;
DROP POLICY IF EXISTS "Allow read access to all users for workflows" ON public.workflows_ax2024;
DROP POLICY IF EXISTS "Allow full access to admins" ON public.projects_ax2024;
DROP POLICY IF EXISTS "Allow access to own projects for users" ON public.projects_ax2024;
DROP POLICY IF EXISTS "Allow full access to admins on tasks" ON public.tasks_ax2024;
DROP POLICY IF EXISTS "Allow users to see tasks on their projects" ON public.tasks_ax2024;

-- Create new, correct policies that check the user's role from the 'users' table
CREATE POLICY "Allow admins full access" ON public.users FOR ALL
  USING ((SELECT role FROM public.users WHERE id = auth.uid()) = 'admin');
CREATE POLICY "Allow users to view their own data" ON public.users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Allow full access to admins" ON public.contacts_ax2024 FOR ALL
  USING ((SELECT role FROM public.users WHERE id = auth.uid()) = 'admin');
CREATE POLICY "Allow access to own contacts for users" ON public.contacts_ax2024 FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "Allow full access to admins" ON public.events_ax2024 FOR ALL
  USING ((SELECT role FROM public.users WHERE id = auth.uid()) = 'admin');
CREATE POLICY "Allow read access to all users for events" ON public.events_ax2024 FOR SELECT
  USING (true);

CREATE POLICY "Allow full access to admins" ON public.ai_interactions_ax2024 FOR ALL
  USING ((SELECT role FROM public.users WHERE id = auth.uid()) = 'admin');
CREATE POLICY "Allow access to own interactions for users" ON public.ai_interactions_ax2024 FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "Allow full access to admins" ON public.api_integrations_ax2024 FOR ALL
  USING ((SELECT role FROM public.users WHERE id = auth.uid()) = 'admin');
CREATE POLICY "Allow read access to all users for api integrations" ON public.api_integrations_ax2024 FOR SELECT
  USING (true);

CREATE POLICY "Allow full access to admins" ON public.api_call_logs_ax2024 FOR ALL
  USING ((SELECT role FROM public.users WHERE id = auth.uid()) = 'admin');
CREATE POLICY "Allow read access to all users for api call logs" ON public.api_call_logs_ax2024 FOR SELECT
  USING (true);

CREATE POLICY "Allow full access to admins" ON public.workflows_ax2024 FOR ALL
  USING ((SELECT role FROM public.users WHERE id = auth.uid()) = 'admin');
CREATE POLICY "Allow read access to all users for workflows" ON public.workflows_ax2024 FOR SELECT
  USING (true);

CREATE POLICY "Allow full access to admins" ON public.projects_ax2024 FOR ALL
  USING ((SELECT role FROM public.users WHERE id = auth.uid()) = 'admin');
CREATE POLICY "Allow access to own projects for users" ON public.projects_ax2024 FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "Allow full access to admins on tasks" ON public.tasks_ax2024 FOR ALL
  USING ((SELECT role FROM public.users WHERE id = auth.uid()) = 'admin');
CREATE POLICY "Allow users to see tasks on their projects" ON public.tasks_ax2024 FOR SELECT
  USING (EXISTS (SELECT 1 FROM projects_ax2024 p WHERE p.id = tasks_ax2024.project_id AND p.user_id = auth.uid()));

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

  -- Upsert the calculated metrics into the daily_metrics table
  -- This assumes a daily_metrics table exists. If not, this function will fail.
  -- Consider adding a check or ensuring the table is created in setup.
  INSERT INTO daily_metrics (metric_date, new_contacts_count, new_events_count, ai_interactions_count, workflow_executions_count)
  VALUES (CURRENT_DATE, v_new_contacts_count, v_new_events_count, v_ai_interactions_count, v_workflow_executions_count)
  ON CONFLICT (metric_date) DO UPDATE
  SET
    new_contacts_count = EXCLUDED.new_contacts_count,
    new_events_count = EXCLUDED.new_events_count,
    ai_interactions_count = EXCLUDED.ai_interactions_count,
    workflow_executions_count = EXCLUDED.workflow_executions_count,
    created_at = NOW();

  -- Return a success message with the calculated metrics
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

-- Seed data
-- Create a reliable admin user for development and testing.
DO $$
DECLARE
  admin_user_id UUID;
BEGIN
  -- 1. Check if the admin user already exists to avoid conflict errors
  SELECT id INTO admin_user_id FROM auth.users WHERE email = 'admin@example.com' LIMIT 1;

  IF admin_user_id IS NULL THEN
    -- If user doesn't exist, create a new UUID and insert them safely
    admin_user_id := gen_random_uuid();

    -- The seed user password is intentionally randomized to force a password reset on first login for security.

    INSERT INTO auth.users (
      id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    )
    VALUES (
      admin_user_id, 'authenticated', 'authenticated', 'admin@example.com',
      crypt(gen_random_uuid()::text, gen_salt('bf')), now(),
      '{"provider": "email", "providers": ["email"]}', '{}', now(), now()
    );
  END IF;

  -- 2. Create the corresponding public user with admin role
  INSERT INTO public.users (id, role)
  VALUES (admin_user_id, 'admin')
  ON CONFLICT (id) DO UPDATE SET
    role = 'admin';

  -- 3. Seed some contacts for the admin user
  INSERT INTO contacts_ax2024 (name, email, source, user_id)
  VALUES
    ('John Doe', 'john.doe@example.com', 'website', admin_user_id),
    ('Jane Smith', 'jane.smith@example.com', 'referral', admin_user_id),
    ('Peter Jones', 'peter.jones@example.com', 'website', admin_user_id)
  ON CONFLICT (email) DO NOTHING;

END $$;

-- 4. Insert basic events
INSERT INTO events_ax2024 (type, source, data) VALUES
('system_startup', 'axim_core', '{"status": "ok"}'),
('user_login', 'auth_service', '{"user": "demo"}');

-- 5. Safely insert API integrations without relying on missing unique constraints
INSERT INTO api_integrations_ax2024 (name, type, status, base_url)
SELECT 'Slack Webhook', 'webhook', 'active', 'https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX'
WHERE NOT EXISTS (SELECT 1 FROM api_integrations_ax2024 WHERE name = 'Slack Webhook');

INSERT INTO api_integrations_ax2024 (name, type, status, base_url)
SELECT 'Stripe API', 'rest_api', 'active', 'https://api.stripe.com/v1'
WHERE NOT EXISTS (SELECT 1 FROM api_integrations_ax2024 WHERE name = 'Stripe API');

-- 6. Insert default workflows
INSERT INTO workflows_ax2024 (name, description, slug) VALUES
('Transcription Sprint Outreach Campaign', 'An outreach campaign for the transcription sprint.', 'transcription_sprint'),
('Axim Project Initiation', 'Initializes a new project within the Axim Core system.', 'axim_project_initiation'),
('Automated Lead Nurturing Sequence', 'An automated sequence for nurturing leads.', 'lead_nurture'),
('Complete System Data Synchronization', 'A complete data synchronization for the system.', 'data_sync'),
('API Integration Health Check', 'A health check for all API integrations.', 'api_health_check')
ON CONFLICT (slug) DO NOTHING;