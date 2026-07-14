
CREATE TABLE IF NOT EXISTS public.ecosystem_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_name VARCHAR(255) NOT NULL UNIQUE,
    webhook_url TEXT,
    api_key TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.ecosystem_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service Role Full Access on Ecosystem Connections"
ON public.ecosystem_connections
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
