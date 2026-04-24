-- Create Ecosystem Connections Vault Table

CREATE TABLE IF NOT EXISTS public.ecosystem_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_name VARCHAR(255) NOT NULL UNIQUE,
    webhook_url TEXT NOT NULL,
    api_key TEXT,
    status VARCHAR(50) DEFAULT 'active',
    last_triggered TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.ecosystem_connections ENABLE ROW LEVEL SECURITY;

-- Allow full access to admins
CREATE POLICY "Allow full access to admins on ecosystem_connections" ON public.ecosystem_connections FOR ALL
  USING ((SELECT role FROM public.users WHERE id = auth.uid()) = 'admin');

-- Service role will automatically bypass RLS

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_ecosystem_connections_modtime()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_ecosystem_connections_modtime
BEFORE UPDATE ON public.ecosystem_connections
FOR EACH ROW
EXECUTE FUNCTION update_ecosystem_connections_modtime();
