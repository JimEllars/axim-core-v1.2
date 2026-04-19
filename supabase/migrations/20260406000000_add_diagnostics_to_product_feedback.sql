
ALTER TABLE public.product_feedback ADD COLUMN IF NOT EXISTS diagnostics JSONB;
