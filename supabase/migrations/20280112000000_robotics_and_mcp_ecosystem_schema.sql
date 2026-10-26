-- 20280112000000_robotics_and_mcp_ecosystem_schema.sql

-- public.robot_projects
CREATE TABLE public.robot_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    robot_class TEXT NOT NULL,
    target_specs JSONB,
    status TEXT
);
ALTER TABLE public.robot_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable read access for all users" ON public.robot_projects FOR SELECT USING (true);
CREATE POLICY "Enable all access for service_role" ON public.robot_projects USING (auth.role() = 'service_role');

-- public.robot_fleet_nodes
CREATE TABLE public.robot_fleet_nodes (
    id TEXT PRIMARY KEY,
    project_id UUID REFERENCES public.robot_projects(id) ON DELETE CASCADE,
    hardware_class TEXT,
    firmware_version TEXT,
    status TEXT,
    last_heartbeat TIMESTAMPTZ
);
ALTER TABLE public.robot_fleet_nodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable read access for all users" ON public.robot_fleet_nodes FOR SELECT USING (true);
CREATE POLICY "Enable all access for service_role" ON public.robot_fleet_nodes USING (auth.role() = 'service_role');

-- public.robot_policy_registry
CREATE TABLE public.robot_policy_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES public.robot_projects(id) ON DELETE CASCADE,
    version TEXT,
    weights_hash TEXT,
    benchmark_score NUMERIC,
    status TEXT
);
ALTER TABLE public.robot_policy_registry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable read access for all users" ON public.robot_policy_registry FOR SELECT USING (true);
CREATE POLICY "Enable all access for service_role" ON public.robot_policy_registry USING (auth.role() = 'service_role');

-- public.robot_telemetry_stream
CREATE TABLE public.robot_telemetry_stream (
    id BIGSERIAL PRIMARY KEY,
    node_id TEXT,
    timestamp TIMESTAMPTZ,
    pitch NUMERIC,
    roll NUMERIC,
    motor_load NUMERIC,
    battery_pct NUMERIC,
    telemetry_payload JSONB
);
CREATE INDEX idx_robot_telemetry_node_time ON public.robot_telemetry_stream(node_id, timestamp DESC);
ALTER TABLE public.robot_telemetry_stream ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable read access for all users" ON public.robot_telemetry_stream FOR SELECT USING (true);
CREATE POLICY "Enable all access for service_role" ON public.robot_telemetry_stream USING (auth.role() = 'service_role');

-- public.robot_fault_logs
CREATE TABLE public.robot_fault_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    node_id TEXT,
    fault_type TEXT,
    severity TEXT,
    diagnostic_trace JSONB
);
ALTER TABLE public.robot_fault_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable read access for all users" ON public.robot_fault_logs FOR SELECT USING (true);
CREATE POLICY "Enable all access for service_role" ON public.robot_fault_logs USING (auth.role() = 'service_role');

-- public.ecosystem_nodes
CREATE TABLE IF NOT EXISTS public.ecosystem_nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE,
    role TEXT,
    status TEXT,
    last_heartbeat TIMESTAMPTZ
);
ALTER TABLE public.ecosystem_nodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable read access for all users" ON public.ecosystem_nodes FOR SELECT USING (true);
CREATE POLICY "Enable all access for service_role" ON public.ecosystem_nodes USING (auth.role() = 'service_role');

-- Seed MCP bridge connection in public.ecosystem_connections
INSERT INTO public.ecosystem_connections (service_name, webhook_url, api_key, status)
VALUES ('axim-core-mcp', 'https://api.axim.us.com/mcp', 'mcp-gateway-internal', 'active')
ON CONFLICT (service_name) DO UPDATE SET webhook_url = EXCLUDED.webhook_url, status = 'active';
