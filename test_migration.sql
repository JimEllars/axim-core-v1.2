CREATE MATERIALIZED VIEW IF NOT EXISTS user_engagement_scores AS
SELECT
    u.id AS user_id,
    u.email,
    -- Frequency of document generation (+ points)
    COALESCE(gen.doc_count, 0) * 10 AS doc_generation_score,
    -- Recent 500 error encounters (- points)
    COALESCE(err.error_count, 0) * -5 AS error_score,
    -- Days since last login (calculated against last_sign_in_at if available or just an estimation)
    0 AS days_since_login_score, -- Needs implementation based on available data
    -- Total Health Index
    GREATEST(0, LEAST(100, 50 + (COALESCE(gen.doc_count, 0) * 10) - (COALESCE(err.error_count, 0) * 5))) AS health_index
FROM auth.users u
LEFT JOIN (
    SELECT user_identifier, COUNT(*) as doc_count
    FROM micro_app_transactions
    WHERE created_at > NOW() - INTERVAL '30 days'
    GROUP BY user_identifier
) gen ON gen.user_identifier = u.id::text OR gen.user_identifier = u.email
LEFT JOIN (
    -- Assuming telemetry_logs exist, otherwise what to use?
    SELECT user_id, COUNT(*) as error_count
    FROM events_ax2024 -- Or some error table
    WHERE type = 'error' AND created_at > NOW() - INTERVAL '30 days'
    GROUP BY user_id
) err ON err.user_id = u.id;
