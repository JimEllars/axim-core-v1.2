-- Add pgvector embedding column to ai_interactions_ax2024
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_interactions_ax2024' AND column_name = 'embedding'
  ) THEN
    ALTER TABLE public.ai_interactions_ax2024 ADD COLUMN embedding vector(1536);
  END IF;
END $$;

-- Create match_ai_interactions RPC
CREATE OR REPLACE FUNCTION public.match_ai_interactions(
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  p_user_id uuid
)
RETURNS TABLE (id uuid, content text, similarity float)
LANGUAGE sql STABLE
AS $$
  SELECT
    id,
    concat_ws(' ', command, response) as content,
    1 - (embedding <=> query_embedding) AS similarity
  FROM ai_interactions_ax2024
  WHERE user_id = p_user_id
    AND embedding IS NOT NULL
    AND 1 - (embedding <=> query_embedding) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
$$;

-- Add a HNSW index for performance
CREATE INDEX IF NOT EXISTS ai_interactions_embedding_idx ON public.ai_interactions_ax2024 USING hnsw (embedding vector_cosine_ops);
