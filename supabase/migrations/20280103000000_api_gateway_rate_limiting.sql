-- Add tracking for rate limiting (ip_address)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'api_usage_logs' AND column_name = 'ip_address') THEN
        ALTER TABLE public.api_usage_logs ADD COLUMN ip_address TEXT;
    END IF;
END $$;
