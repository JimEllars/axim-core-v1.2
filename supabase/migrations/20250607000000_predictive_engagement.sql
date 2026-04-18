CREATE MATERIALIZED VIEW IF NOT EXISTS user_engagement_scores AS
SELECT
    u.id AS user_id,
    u.email,
    -- Frequency of document generation (+ points)
    COALESCE(gen.doc_count, 0) * 10 AS doc_generation_score,
    -- Recent 500 error encounters (- points)
    COALESCE(err.error_count, 0) * -5 AS error_score,
    -- Days since last login
    CASE
        WHEN last_login_event.created_at IS NOT NULL THEN
            EXTRACT(DAY FROM NOW() - last_login_event.created_at) * -2
        ELSE -10
    END AS days_since_login_score,
    -- Total Health Index
    GREATEST(0, LEAST(100,
        50 +
        (COALESCE(gen.doc_count, 0) * 10) +
        (COALESCE(err.error_count, 0) * -5) +
        (CASE
            WHEN last_login_event.created_at IS NOT NULL THEN
                EXTRACT(DAY FROM NOW() - last_login_event.created_at) * -2
            ELSE -10
        END)
    )) AS health_index
FROM auth.users u
LEFT JOIN (
    SELECT user_identifier, COUNT(*) as doc_count
    FROM micro_app_transactions
    WHERE created_at > NOW() - INTERVAL '30 days'
    GROUP BY user_identifier
) gen ON gen.user_identifier = u.id::text OR gen.user_identifier = u.email
LEFT JOIN (
    SELECT user_id, COUNT(*) as error_count
    FROM events_ax2024
    WHERE type = 'error' AND created_at > NOW() - INTERVAL '30 days'
    GROUP BY user_id
) err ON err.user_id = u.id
LEFT JOIN LATERAL (
    SELECT created_at
    FROM events_ax2024
    WHERE user_id = u.id AND type = 'user_login'
    ORDER BY created_at DESC
    LIMIT 1
) last_login_event ON true;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_engagement_scores_user_id ON user_engagement_scores(user_id);
