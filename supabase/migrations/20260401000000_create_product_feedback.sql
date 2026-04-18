CREATE TABLE IF NOT EXISTS public.product_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    document_id TEXT,
    app_source TEXT NOT NULL,
    sentiment TEXT NOT NULL,
    comments TEXT
);

-- Basic RLS
ALTER TABLE public.product_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage product feedback"
ON public.product_feedback
FOR ALL
USING (true)
WITH CHECK (true);
