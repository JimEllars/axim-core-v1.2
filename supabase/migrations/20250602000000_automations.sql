-- Create Automations table for scheduling tasks
CREATE TABLE IF NOT EXISTS automations_ax2024 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    type TEXT NOT NULL, -- e.g., 'google_trends_scan', 'content_engine_feed', 'webhook'
    schedule TEXT NOT NULL, -- Cron expression
    config JSONB DEFAULT '{}'::jsonb,
    enabled BOOLEAN DEFAULT true,
    last_run TIMESTAMPTZ,
    next_run TIMESTAMPTZ, -- Calculated
    user_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE automations_ax2024 ENABLE ROW LEVEL SECURITY;

-- Policies for Automations
CREATE POLICY "Allow full access to admins" ON public.automations_ax2024 FOR ALL
  USING ((SELECT role FROM public.users WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Allow read access to owner" ON public.automations_ax2024 FOR SELECT
  USING (auth.uid() = user_id);

-- Create Automation Logs table
CREATE TABLE IF NOT EXISTS automation_logs_ax2024 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    automation_id UUID REFERENCES automations_ax2024(id) ON DELETE CASCADE,
    status TEXT NOT NULL, -- 'success', 'failed'
    output JSONB,
    execution_time_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE automation_logs_ax2024 ENABLE ROW LEVEL SECURITY;

-- Policies for Automation Logs
CREATE POLICY "Allow full access to admins" ON public.automation_logs_ax2024 FOR ALL
  USING ((SELECT role FROM public.users WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Allow read access to owner" ON public.automation_logs_ax2024 FOR SELECT
  USING (EXISTS (SELECT 1 FROM automations_ax2024 WHERE id = automation_logs_ax2024.automation_id AND user_id = auth.uid()));

-- Insert default automation: Google Trends Scan daily at 5 AM
INSERT INTO automations_ax2024 (name, type, schedule, config, enabled, user_id)
SELECT 'Google Trends Daily Scan', 'google_trends_scan', '0 5 * * *', '{"geo": "US", "category": "all"}'::jsonb, true, id
FROM auth.users
WHERE email = 'admin@axim.com' -- Or find admin user dynamically
LIMIT 1
ON CONFLICT DO NOTHING;
