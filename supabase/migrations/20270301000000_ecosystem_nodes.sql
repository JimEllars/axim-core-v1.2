-- Create ecosystem_nodes table
CREATE TABLE IF NOT EXISTS public.ecosystem_nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_name TEXT NOT NULL,
    health_endpoint_url TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'operational',
    last_ping TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Optional: Enable RLS
ALTER TABLE public.ecosystem_nodes ENABLE ROW LEVEL SECURITY;

-- Basic policy: Allow read access to authenticated users
CREATE POLICY "Enable read access for all authenticated users" ON public.ecosystem_nodes
    FOR SELECT TO authenticated USING (true);

-- Allow service role full access
CREATE POLICY "Enable full access for service role" ON public.ecosystem_nodes
    FOR ALL TO service_role USING (true) WITH CHECK (true);
