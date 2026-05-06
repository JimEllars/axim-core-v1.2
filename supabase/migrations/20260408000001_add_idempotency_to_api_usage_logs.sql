ALTER TABLE public.api_usage_logs ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
CREATE INDEX IF NOT EXISTS api_usage_logs_idempotency_key_idx ON public.api_usage_logs (idempotency_key);
