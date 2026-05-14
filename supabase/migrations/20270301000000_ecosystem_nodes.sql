CREATE TABLE IF NOT EXISTS ecosystem_nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_name TEXT NOT NULL,
    health_endpoint_url TEXT NOT NULL,
    status TEXT DEFAULT 'online',
    last_ping TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ecosystem_nodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read access to ecosystem_nodes" ON public.ecosystem_nodes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow service role full access to ecosystem_nodes" ON public.ecosystem_nodes
  USING (true)
  WITH CHECK (true);
