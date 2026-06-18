CREATE OR REPLACE FUNCTION public.backfill_ai_embeddings()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.tasks (title, description, status)
    SELECT 'Backfill Embedding', 'AI Interaction ID: ' || id::text, 'pending'
    FROM public.ai_interactions_ax2024
    WHERE embedding IS NULL;
END;
$$;
