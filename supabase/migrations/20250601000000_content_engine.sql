-- Create Generated Content table
CREATE TABLE IF NOT EXISTS generated_content_ax2024 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT,
    content TEXT,
    source_url TEXT,
    topic TEXT,
    status TEXT DEFAULT 'draft', -- 'draft', 'published', 'failed'
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    user_id UUID REFERENCES auth.users(id)
);

ALTER TABLE generated_content_ax2024 ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Allow full access to admins" ON public.generated_content_ax2024 FOR ALL
  USING ((SELECT role FROM public.users WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Allow read access to all users" ON public.generated_content_ax2024 FOR SELECT
  USING (true);
