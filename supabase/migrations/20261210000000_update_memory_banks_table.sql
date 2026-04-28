CREATE TABLE IF NOT EXISTS public.ai_memory_banks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id),
    content TEXT NOT NULL,
    source_type TEXT NOT NULL,
    metadata JSONB,
    embedding vector(1536),
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.ai_memory_banks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow access to own ai_memory_banks for users" ON public.ai_memory_banks FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "Allow full access to admins on ai_memory_banks" ON public.ai_memory_banks FOR ALL
  USING ((SELECT role FROM public.users WHERE id = auth.uid()) = 'admin');

CREATE INDEX IF NOT EXISTS ai_memory_banks_embedding_idx ON public.ai_memory_banks USING hnsw (embedding vector_l2_ops);

CREATE OR REPLACE FUNCTION public.match_ai_memory_banks(
    query_embedding vector(1536),
    match_threshold float,
    match_count int,
    p_user_id uuid default null
)
RETURNS TABLE (
    id uuid,
    content text,
    metadata jsonb,
    similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        mb.id,
        mb.content,
        mb.metadata,
        1 - (mb.embedding <=> query_embedding) AS similarity
    FROM public.ai_memory_banks mb
    WHERE 1 - (mb.embedding <=> query_embedding) > match_threshold
      AND (p_user_id IS NULL OR mb.user_id = p_user_id)
    ORDER BY mb.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;
