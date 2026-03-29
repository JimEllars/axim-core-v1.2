-- Enable the pgvector extension to work with embedding vectors
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column to ai_interactions_ax2024
ALTER TABLE ai_interactions_ax2024
ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Create a function to search for matching AI interactions
CREATE OR REPLACE FUNCTION match_ai_interactions(
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  p_user_id uuid
)
RETURNS TABLE (
  id uuid,
  command text,
  response text,
  created_at timestamptz,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ai.id,
    ai.command,
    ai.response,
    ai.created_at,
    1 - (ai.embedding <=> query_embedding) AS similarity
  FROM ai_interactions_ax2024 ai
  WHERE ai.embedding IS NOT NULL
    AND ai.user_id = p_user_id
    AND 1 - (ai.embedding <=> query_embedding) > match_threshold
  ORDER BY ai.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
