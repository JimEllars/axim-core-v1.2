CREATE TABLE IF NOT EXISTS public.api_usage_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    api_key_id UUID REFERENCES public.api_keys(id) ON DELETE CASCADE,
    partner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index for querying rate limits quickly
CREATE INDEX IF NOT EXISTS api_usage_logs_key_time_idx ON public.api_usage_logs (api_key_id, created_at);

-- Add tier and rate_limit to api_keys if they don't exist
ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS tier TEXT DEFAULT 'standard';
ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS rate_limit INTEGER DEFAULT 100;
