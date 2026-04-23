-- Add granular API key features
ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS environment TEXT DEFAULT 'live';
ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS scopes JSONB DEFAULT '["full_access"]'::jsonb;
ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS allowed_ips JSONB DEFAULT '[]'::jsonb;

-- Add tracking columns used by api-gateway
ALTER TABLE public.api_usage_logs ADD COLUMN IF NOT EXISTS status_code INTEGER;
ALTER TABLE public.api_usage_logs ADD COLUMN IF NOT EXISTS compute_ms INTEGER;
ALTER TABLE public.api_usage_logs ADD COLUMN IF NOT EXISTS billed BOOLEAN DEFAULT false;
