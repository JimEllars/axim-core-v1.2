-- Enable the pgvector extension to work with embedding vectors
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column of type vector(1536) to ai_interactions_ax2024
ALTER TABLE public.ai_interactions_ax2024 ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Optimize vector search with hnsw index if not created yet
CREATE INDEX IF NOT EXISTS ai_interactions_embedding_idx ON public.ai_interactions_ax2024 USING hnsw (embedding vector_l2_ops);

-- Create or replace match_ai_interactions RPC function for semantic search
CREATE OR REPLACE FUNCTION match_ai_interactions (
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  p_user_id uuid default null,
  p_offset int default 0
)
RETURNS TABLE (
  id uuid,
  command text,
  response text,
  similarity float,
  created_at timestamptz
)
LANGUAGE sql STABLE
AS $$
  SELECT
    id,
    command,
    response,
    1 - (ai_interactions_ax2024.embedding <=> query_embedding) AS similarity,
    created_at
  FROM public.ai_interactions_ax2024
  WHERE 1 - (ai_interactions_ax2024.embedding <=> query_embedding) > match_threshold
    AND (p_user_id IS NULL OR ai_interactions_ax2024.user_id = p_user_id)
  ORDER BY similarity DESC
  LIMIT match_count
  OFFSET p_offset;
$$;
