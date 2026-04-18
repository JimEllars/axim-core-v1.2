-- Create RPC for fleet snapshot
CREATE OR REPLACE FUNCTION get_fleet_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    total_fleet_health numeric;
    total_transactions_24h integer;
    top_at_risk_users jsonb;
    result jsonb;
BEGIN
    -- 1. Total Fleet Health (average of all device statuses/health_index)
    SELECT COALESCE(AVG(health_index), 0) INTO total_fleet_health
    FROM user_engagement_scores;

    -- 2. Total Transactions (last 24h)
    SELECT COUNT(*) INTO total_transactions_24h
    FROM micro_app_transactions
    WHERE created_at > NOW() - INTERVAL '24 hours';

    -- 3. Top 3 At-Risk Users
    SELECT jsonb_agg(
        jsonb_build_object(
            'user_id', user_id,
            'email', email,
            'health_index', health_index
        )
    ) INTO top_at_risk_users
    FROM (
        SELECT user_id, email, health_index
        FROM user_engagement_scores
        ORDER BY health_index ASC
        LIMIT 3
    ) sub;

    result := jsonb_build_object(
        'total_fleet_health', ROUND(total_fleet_health, 2),
        'total_transactions_24h', total_transactions_24h,
        'top_at_risk_users', COALESCE(top_at_risk_users, '[]'::jsonb)
    );

    RETURN result;
END;
$$;
