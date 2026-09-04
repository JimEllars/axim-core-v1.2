-- Add telemetry cost tracking fields
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'api_usage_logs' AND column_name = 'provider') THEN
        ALTER TABLE public.api_usage_logs ADD COLUMN provider VARCHAR(50);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'api_usage_logs' AND column_name = 'prompt_tokens') THEN
        ALTER TABLE public.api_usage_logs ADD COLUMN prompt_tokens INTEGER;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'api_usage_logs' AND column_name = 'completion_tokens') THEN
        ALTER TABLE public.api_usage_logs ADD COLUMN completion_tokens INTEGER;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'api_usage_logs' AND column_name = 'estimated_cost_usd') THEN
        ALTER TABLE public.api_usage_logs ADD COLUMN estimated_cost_usd NUMERIC(10, 6);
    END IF;
END $$;
