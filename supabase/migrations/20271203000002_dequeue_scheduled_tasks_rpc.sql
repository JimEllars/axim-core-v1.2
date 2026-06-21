CREATE OR REPLACE FUNCTION public.dequeue_scheduled_tasks(max_tasks int)
RETURNS SETOF scheduled_tasks
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.scheduled_tasks
  SET status = 'processing'
  WHERE id IN (
    SELECT id
    FROM public.scheduled_tasks
    WHERE status = 'active'
      AND next_run_at <= NOW()
    ORDER BY next_run_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT max_tasks
  )
  RETURNING *;
END;
$$;
