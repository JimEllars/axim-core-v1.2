-- Create memory_banks table
CREATE TABLE IF NOT EXISTS public.memory_banks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    summary_date DATE NOT NULL,
    executive_summary TEXT,
    key_decisions JSONB DEFAULT '[]'::jsonb,
    embedding vector(1536),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.memory_banks ENABLE ROW LEVEL SECURITY;

-- Create policies allowing full access ONLY to 'admin' roles
CREATE POLICY "Allow full access to admins on memory_banks" ON public.memory_banks FOR ALL
  USING ((SELECT role FROM public.users WHERE id = auth.uid()) = 'admin');

-- Add index on summary_date for fast lookups
CREATE INDEX IF NOT EXISTS memory_banks_summary_date_idx ON public.memory_banks (summary_date);

-- Add index on embedding for vector similarity searches
CREATE INDEX IF NOT EXISTS memory_banks_embedding_idx ON public.memory_banks USING hnsw (embedding vector_l2_ops);
