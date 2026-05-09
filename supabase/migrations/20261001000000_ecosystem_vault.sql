-- Create Ecosystem Vault table for storing third-party API keys securely

CREATE TABLE IF NOT EXISTS public.ecosystem_vault (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_name VARCHAR(255) NOT NULL UNIQUE,
    api_key TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Turn on RLS
ALTER TABLE public.ecosystem_vault ENABLE ROW LEVEL SECURITY;

-- Only service role can access this table directly
CREATE POLICY "Service Role Full Access"
ON public.ecosystem_vault
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
