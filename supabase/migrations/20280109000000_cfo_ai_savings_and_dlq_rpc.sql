-- 1. RPC to calculate billed AI spend and disk KV cache savings
CREATE OR REPLACE FUNCTION public.get_ai_cost_and_savings_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'total_requests', COUNT(*),
    'deepseek_requests', COUNT(*) FILTER (WHERE provider = 'deepseek'),
    'anthropic_failover_requests', COUNT(*) FILTER (WHERE provider = 'anthropic' OR failover_occurred = true),
    'total_prompt_tokens', COALESCE(SUM(prompt_tokens), 0),
    'total_completion_tokens', COALESCE(SUM(completion_tokens), 0),
    'total_cache_hit_tokens', COALESCE(SUM(prompt_cache_hit_tokens), 0),
    'total_cache_miss_tokens', COALESCE(SUM(prompt_cache_miss_tokens), 0),
    'cache_hit_ratio', CASE
      WHEN (SUM(prompt_cache_hit_tokens) + SUM(prompt_cache_miss_tokens)) > 0
      THEN ROUND((SUM(prompt_cache_hit_tokens)::numeric / (SUM(prompt_cache_hit_tokens) + SUM(prompt_cache_miss_tokens)) * 100), 2)
      ELSE 0
    END,
    -- DeepSeek Pricing: $0.007/1M hit vs $0.22/1M miss. Savings = hit_tokens * (0.22 - 0.007) / 1,000,000
    'estimated_dollars_saved', ROUND(
      (COALESCE(SUM(prompt_cache_hit_tokens), 0)::numeric * (0.22 - 0.007) / 1000000.0), 2
    ),
    'estimated_actual_spend', ROUND(
      ((COALESCE(SUM(prompt_cache_hit_tokens), 0)::numeric * 0.007 / 1000000.0) +
       (COALESCE(SUM(prompt_cache_miss_tokens), 0)::numeric * 0.22 / 1000000.0) +
       (COALESCE(SUM(completion_tokens), 0)::numeric * 0.88 / 1000000.0)), 2
    )
  ) INTO result
  FROM public.api_usage_logs;

  RETURN result;
END;
$$;

-- 2. RPC to re-queue a job from dead_letter_jobs back to satellite_job_queue
CREATE OR REPLACE FUNCTION public.retry_dead_letter_job(target_job_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  job_rec record;
BEGIN
  SELECT * INTO job_rec FROM public.dead_letter_jobs WHERE id = target_job_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Re-insert into active queue with reset retry count
  INSERT INTO public.satellite_job_queue (
    workflow_type,
    payload,
    trigger_source,
    status,
    retry_count,
    created_at
  ) VALUES (
    job_rec.workflow_type,
    job_rec.payload,
    job_rec.trigger_source,
    'pending',
    0,
    NOW()
  );

  -- Remove from DLQ
  DELETE FROM public.dead_letter_jobs WHERE id = target_job_id;
  RETURN true;
END;
$$;
