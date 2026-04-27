CREATE OR REPLACE FUNCTION resolve_hitl_action(
    p_log_id UUID,
    p_status TEXT,
    p_action_payload JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_target_app TEXT;
    v_action TEXT;
BEGIN
    UPDATE hitl_audit_logs
    SET status = p_status
    WHERE id = p_log_id
    RETURNING action INTO v_action;

    IF p_status = 'Approved' AND p_action_payload IS NOT NULL THEN
        IF p_action_payload->>'action' = 'quarantine_app' THEN
            v_target_app := p_action_payload->>'target';
            IF v_target_app IS NOT NULL THEN
                UPDATE ecosystem_apps
                SET is_active = false
                WHERE app_id = v_target_app;
            END IF;
        END IF;
    END IF;

    -- Note: for "publish_article" action, the edge function invoke will be handled by the client or a specialized edge function
    -- The updated RPC returns action so we can tell if we need to call an edge function

    -- Return success and the updated status
    RETURN jsonb_build_object('success', true, 'status', p_status, 'action', v_action);
END;
$$;
