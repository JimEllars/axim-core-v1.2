ALTER TABLE public.telemetry_logs
ADD COLUMN IF NOT EXISTS country_code TEXT,
ADD COLUMN IF NOT EXISTS ip_address TEXT;
