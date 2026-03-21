-- Function to match AI interactions based on embedding
create or replace function match_ai_interactions (
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  p_user_id uuid default null
)
returns table (
  id uuid,
  command text,
  response text,
  similarity float
)
language sql stable
as $$
  select
    id,
    command,
    response,
    1 - (ai_interactions_ax2024.embedding <=> query_embedding) as similarity
  from public.ai_interactions_ax2024
  where 1 - (ai_interactions_ax2024.embedding <=> query_embedding) > match_threshold
    and (p_user_id is null or ai_interactions_ax2024.user_id = p_user_id)
  order by similarity desc
  limit match_count;
$$;
