ALTER TABLE public.api_usage_logs
  ADD COLUMN IF NOT EXISTS prompt_cache_hit_tokens INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prompt_cache_miss_tokens INTEGER NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.get_ai_cost_and_savings_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Administrator access is required';
  END IF;

  SELECT jsonb_build_object(
    'total_requests', COUNT(*),
    'deepseek_requests', COUNT(*) FILTER (WHERE provider = 'deepseek'),
    'anthropic_failover_requests', COUNT(*) FILTER (
      WHERE provider = 'anthropic' OR COALESCE(metadata ->> 'failover_occurred', 'false') = 'true'
    ),
    'total_prompt_tokens', COALESCE(SUM(prompt_tokens), 0),
    'total_completion_tokens', COALESCE(SUM(completion_tokens), 0),
    'total_cache_hit_tokens', COALESCE(SUM(prompt_cache_hit_tokens), 0),
    'total_cache_miss_tokens', COALESCE(SUM(prompt_cache_miss_tokens), 0),
    'cache_hit_ratio', COALESCE(
      ROUND(
        SUM(prompt_cache_hit_tokens)::numeric
        / NULLIF(SUM(prompt_cache_hit_tokens) + SUM(prompt_cache_miss_tokens), 0) * 100,
        2
      ),
      0
    ),
    'estimated_dollars_saved', ROUND(
      COALESCE(SUM(prompt_cache_hit_tokens), 0)::numeric * (0.22 - 0.007) / 1000000,
      2
    ),
    'deepseek_spend', ROUND(
      (
        COALESCE(SUM(prompt_cache_hit_tokens) FILTER (WHERE provider = 'deepseek'), 0)::numeric * 0.007
        + COALESCE(SUM(prompt_cache_miss_tokens) FILTER (WHERE provider = 'deepseek'), 0)::numeric * 0.22
        + COALESCE(SUM(completion_tokens) FILTER (WHERE provider = 'deepseek'), 0)::numeric * 0.88
      ) / 1000000,
      2
    ),
    'anthropic_failover_spend', ROUND(
      COALESCE(SUM(estimated_cost_usd) FILTER (
        WHERE provider = 'anthropic' OR COALESCE(metadata ->> 'failover_occurred', 'false') = 'true'
      ), 0),
      2
    ),
    'estimated_actual_spend', ROUND(
      (
        COALESCE(SUM(prompt_cache_hit_tokens), 0)::numeric * 0.007
        + COALESCE(SUM(prompt_cache_miss_tokens), 0)::numeric * 0.22
        + COALESCE(SUM(completion_tokens), 0)::numeric * 0.88
      ) / 1000000,
      2
    )
  )
  INTO result
  FROM public.api_usage_logs;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.retry_dead_letter_job(target_job_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  dead_letter_job public.dead_letter_jobs%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Administrator access is required';
  END IF;

  SELECT *
  INTO dead_letter_job
  FROM public.dead_letter_jobs
  WHERE id = target_job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  INSERT INTO public.satellite_job_queue (
    app_id,
    payload,
    status,
    attempts,
    error_log,
    created_at,
    next_run_at
  )
  VALUES (
    dead_letter_job.app_id,
    dead_letter_job.payload,
    'pending',
    0,
    NULL,
    NOW(),
    NOW()
  );

  DELETE FROM public.dead_letter_jobs WHERE id = target_job_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.get_ai_cost_and_savings_summary() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.retry_dead_letter_job(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_ai_cost_and_savings_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.retry_dead_letter_job(uuid) TO authenticated;
