CREATE TABLE IF NOT EXISTS public.action_agent_quotas (
    agent_name TEXT PRIMARY KEY,
    daily_limit_tokens INTEGER NOT NULL,
    tokens_consumed_today INTEGER DEFAULT 0,
    consecutive_failures_allowed INTEGER DEFAULT 3,
    is_active BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.verify_agent_quota(target_agent TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    v_allowed BOOLEAN;
BEGIN
    SELECT (tokens_consumed_today < daily_limit_tokens) AND is_active
    INTO v_allowed
    FROM public.action_agent_quotas
    WHERE agent_name = target_agent;

    RETURN COALESCE(v_allowed, FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
