
ALTER TABLE public.product_feedback ADD COLUMN IF NOT EXISTS diagnostics JSONB;

-- Add score to product feedback
ALTER TABLE public.product_feedback ADD COLUMN IF NOT EXISTS score INTEGER;
