CREATE OR REPLACE FUNCTION public.match_memory_banks(
    query_embedding vector(1536),
    match_threshold float,
    match_count int
)
RETURNS TABLE (
    id uuid,
    summary_date date,
    executive_summary text,
    key_decisions jsonb,
    similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        mb.id,
        mb.summary_date,
        mb.executive_summary,
        mb.key_decisions,
        1 - (mb.embedding <=> query_embedding) AS similarity
    FROM public.memory_banks mb
    WHERE 1 - (mb.embedding <=> query_embedding) > match_threshold
    ORDER BY mb.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;
