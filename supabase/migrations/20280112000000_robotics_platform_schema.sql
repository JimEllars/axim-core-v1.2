CREATE TYPE robot_class_enum AS ENUM ('hexapod', 'quadruped', 'rover', 'arm');
CREATE TYPE robot_fleet_status AS ENUM ('online', 'offline', 'simulated', 'maintenance', 'emergency_stop');
CREATE TYPE policy_status_enum AS ENUM ('staged', 'evaluating', 'approved', 'deprecated');

CREATE TABLE IF NOT EXISTS public.robot_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    robot_class robot_class_enum NOT NULL,
    target_specs JSONB DEFAULT '{}'::jsonb,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.robot_fleet_nodes (
    id TEXT PRIMARY KEY,
    project_id UUID REFERENCES public.robot_projects(id) ON DELETE CASCADE,
    hardware_class TEXT NOT NULL,
    firmware_version TEXT,
    ip_address TEXT,
    status robot_fleet_status DEFAULT 'offline',
    last_heartbeat TIMESTAMPTZ,
    telemetry_summary JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.robot_policy_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES public.robot_projects(id) ON DELETE CASCADE,
    version TEXT NOT NULL,
    weights_hash TEXT NOT NULL,
    benchmark_score NUMERIC,
    status policy_status_enum DEFAULT 'staged',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.robot_telemetry_stream (
    id BIGSERIAL PRIMARY KEY,
    node_id TEXT REFERENCES public.robot_fleet_nodes(id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    pitch NUMERIC,
    roll NUMERIC,
    motor_load NUMERIC,
    battery_pct NUMERIC,
    telemetry_payload JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_robot_telemetry_node_time ON public.robot_telemetry_stream (node_id, timestamp DESC);

CREATE TABLE IF NOT EXISTS public.robot_fault_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    node_id TEXT,
    fault_type TEXT NOT NULL,
    severity TEXT NOT NULL,
    diagnostic_trace JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

ALTER TABLE public.robot_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.robot_fleet_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.robot_policy_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.robot_telemetry_stream ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.robot_fault_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service role full access on robot_projects" ON public.robot_projects FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Allow authenticated read on robot_projects" ON public.robot_projects FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Allow service role full access on robot_fleet_nodes" ON public.robot_fleet_nodes FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Allow authenticated read on robot_fleet_nodes" ON public.robot_fleet_nodes FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Allow service role full access on robot_policy_registry" ON public.robot_policy_registry FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Allow authenticated read on robot_policy_registry" ON public.robot_policy_registry FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Allow service role full access on robot_telemetry_stream" ON public.robot_telemetry_stream FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Allow authenticated read on robot_telemetry_stream" ON public.robot_telemetry_stream FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Allow service role full access on robot_fault_logs" ON public.robot_fault_logs FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Allow authenticated read on robot_fault_logs" ON public.robot_fault_logs FOR SELECT USING (auth.role() = 'authenticated');
