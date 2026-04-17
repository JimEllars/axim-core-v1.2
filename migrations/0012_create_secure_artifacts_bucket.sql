-- Create secure_artifacts storage bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('secure_artifacts', 'secure_artifacts', false)
ON CONFLICT (id) DO NOTHING;

-- Create partner_credits table
CREATE TABLE IF NOT EXISTS public.partner_credits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_id UUID NOT NULL, -- references auth.users or a partners table
    credits_remaining INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.partner_credits ENABLE ROW LEVEL SECURITY;

-- Note: RLS policies should be added here depending on requirements.
-- The API Gateway will use service role to check and decrement this.
