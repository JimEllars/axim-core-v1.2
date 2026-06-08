-- Add granular API key features
ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS environment TEXT DEFAULT 'live';
ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS scopes JSONB DEFAULT '["full_access"]'::jsonb;
ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS allowed_ips JSONB DEFAULT '[]'::jsonb;

-- Add tracking columns used by api-gateway
ALTER TABLE public.api_usage_logs ADD COLUMN IF NOT EXISTS status_code INTEGER;
ALTER TABLE public.api_usage_logs ADD COLUMN IF NOT EXISTS compute_ms INTEGER;
ALTER TABLE public.api_usage_logs ADD COLUMN IF NOT EXISTS billed BOOLEAN DEFAULT false;

-- For Decentralized Micro-App API Token Hardening
-- We have added scopes JSONB column previously, we should ensure the micro_app_external scope exists or just update existing ones if necessary.
-- We can add a simple index to speed up api_keys lookups
CREATE INDEX IF NOT EXISTS api_keys_api_key_idx ON public.api_keys(api_key);
