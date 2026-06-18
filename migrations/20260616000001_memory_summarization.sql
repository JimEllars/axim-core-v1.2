-- Migration for memory summarization task
CREATE OR REPLACE FUNCTION summarize_daily_interactions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.tasks (title, description, status, app_id)
    SELECT 'Summarize Daily AI Interactions', 'User ID: ' || user_id, 'pending', 'axim_core'
    FROM (
        SELECT DISTINCT user_id
        FROM public.ai_interactions_ax2024
        WHERE created_at >= NOW() - INTERVAL '1 day'
    ) AS recent_users;
END;
$$;
