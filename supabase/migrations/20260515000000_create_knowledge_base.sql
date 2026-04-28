CREATE TABLE IF NOT EXISTS executive_knowledge_base (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    content_chunk TEXT NOT NULL,
    embedding VECTOR(1536),
    source_type TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE executive_knowledge_base ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow admins to view knowledge base" ON public.executive_knowledge_base FOR SELECT
  USING ((SELECT role FROM public.users WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Allow admins to insert into knowledge base" ON public.executive_knowledge_base FOR INSERT
  WITH CHECK ((SELECT role FROM public.users WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Allow admins to update knowledge base" ON public.executive_knowledge_base FOR UPDATE
  USING ((SELECT role FROM public.users WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Allow admins to delete from knowledge base" ON public.executive_knowledge_base FOR DELETE
  USING ((SELECT role FROM public.users WHERE id = auth.uid()) = 'admin');

CREATE OR REPLACE FUNCTION match_knowledge_base(
  query_embedding VECTOR(1536),
  match_threshold FLOAT,
  match_count INT
)
RETURNS TABLE(
  id UUID,
  title TEXT,
  content_chunk TEXT,
  source_type TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ekb.id,
    ekb.title,
    ekb.content_chunk,
    ekb.source_type,
    1 - (ekb.embedding <=> query_embedding) AS similarity
  FROM executive_knowledge_base ekb
  WHERE 1 - (ekb.embedding <=> query_embedding) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;
