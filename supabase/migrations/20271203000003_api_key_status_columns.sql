-- Add status and revoked_at to api_keys
ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active';
ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;
