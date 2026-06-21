CREATE OR REPLACE FUNCTION public.backfill_ai_embeddings()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.satellite_job_queue (app_id, task_type, payload, status)
    SELECT 'system', 'backfill_embedding', jsonb_build_object('interaction_id', id), 'pending'
    FROM public.ai_interactions_ax2024
    WHERE embedding IS NULL
      AND id NOT IN (
          SELECT (payload->>'interaction_id')::bigint
          FROM public.satellite_job_queue
          WHERE task_type = 'backfill_embedding' AND status = 'pending'
      )
    LIMIT 100; -- Batched to avoid overwhelming the queue
END;
$$;
