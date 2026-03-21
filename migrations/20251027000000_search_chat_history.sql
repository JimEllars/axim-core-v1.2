
-- Function to search chat history by keyword
CREATE OR REPLACE FUNCTION search_chat_history(query_text TEXT)
RETURNS TABLE (
    command TEXT,
    response TEXT,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        ai.command,
        ai.response,
        ai.created_at
    FROM
        ai_interactions_ax2024 ai
    WHERE
        ai.user_id = auth.uid()
        AND (
            ai.command ILIKE '%' || query_text || '%'
            OR ai.response ILIKE '%' || query_text || '%'
        )
    ORDER BY
        ai.created_at DESC
    LIMIT 20;
END;
$$;
