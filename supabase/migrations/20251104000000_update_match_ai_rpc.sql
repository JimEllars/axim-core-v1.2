-- Safely modify the match_ai_interactions function to include p_agent_id
DROP FUNCTION IF EXISTS match_ai_interactions(vector(1536), float, int, uuid);

CREATE OR REPLACE FUNCTION match_ai_interactions (
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  p_user_id uuid default null,
  p_agent_id text default null
)
RETURNS TABLE (
  id uuid,
  command text,
  response text,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    id,
    command,
    response,
    1 - (ai_interactions_ax2024.embedding <=> query_embedding) as similarity
  FROM public.ai_interactions_ax2024
  WHERE 1 - (ai_interactions_ax2024.embedding <=> query_embedding) > match_threshold
    AND (p_user_id IS NULL OR ai_interactions_ax2024.user_id = p_user_id)
    -- Compartmentalize by matching agent_id to llm_model or metadata inside response/command
    -- as there is no specific agent_id column in the base schema
    AND (p_agent_id IS NULL OR ai_interactions_ax2024.llm_model = p_agent_id OR ai_interactions_ax2024.command_type = p_agent_id)
  ORDER BY similarity DESC
  LIMIT match_count;
$$;
