-- Harden the AI/RAG RPC surface.
--
-- Two functions on this project were executable by anyone holding the anon key
-- and each was sufficient to take over the system:
--
--   public.safe_sql_executor(text)  -- SECURITY DEFINER, no role check, runs the
--                                      caller's string as SQL. A data-modifying
--                                      CTE (`WITH x AS (DELETE ... RETURNING *)`)
--                                      is valid inside the subquery, so this was
--                                      arbitrary read/write as the owner.
--
--   public.resolve_hitl_action(...)  -- SECURITY DEFINER, no role check. Any
--                                      anonymous caller could mark a HITL record
--                                      "Approved" and pass
--                                      {"action":"quarantine_app","target":"<id>"}
--                                      which sets ecosystem_apps.is_active = false.
--                                      That is the human-in-the-loop control
--                                      plane, with the human removed.
--
-- This migration removes the first and puts a real guard on the second.

-- 0. Dependency check ----------------------------------------------------------
-- resolve_hitl_action below calls public.is_admin(), created by
-- 20281031000000_fix_users_rls_recursion.sql. Fail loudly if it is absent rather
-- than creating an unguarded function whose guard silently evaluates to false.
DO $$
BEGIN
    IF to_regprocedure('public.is_admin()') IS NULL THEN
        RAISE EXCEPTION 'public.is_admin() is missing; apply 20281031000000_fix_users_rls_recursion.sql first';
    END IF;
END;
$$;

-- 1. safe_sql_executor ---------------------------------------------------------
-- Nothing in the repository calls it (verified by grep across src/, supabase/
-- and cloudflare-workers/). If a future need arises it must be rebuilt with an
-- admin check, a pinned search_path and EXECUTE revoked from PUBLIC.
DROP FUNCTION IF EXISTS public.safe_sql_executor(text);

-- 2. resolve_hitl_action -------------------------------------------------------
-- Preserve both legitimate callers:
--   * supabase/functions/resolve-hitl  -> service_role (supabaseAdmin)
--   * src/services/supabaseApiService  -> a signed-in admin (auth.uid())
-- and reject everyone else, including anon.
CREATE OR REPLACE FUNCTION public.resolve_hitl_action(
    p_log_id UUID,
    p_status TEXT,
    p_action_payload JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_target_app TEXT;
    v_action TEXT;
    v_role TEXT;
BEGIN
    -- service_role bypasses the admin check; everyone else must be an admin.
    v_role := coalesce(current_setting('request.jwt.claim.role', true), '');
    IF v_role <> 'service_role' AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'resolve_hitl_action requires service_role or an admin account'
            USING ERRCODE = '42501';
    END IF;

    IF p_status NOT IN ('Approved', 'Rejected', 'approved', 'rejected') THEN
        RAISE EXCEPTION 'invalid HITL status: %', p_status
            USING ERRCODE = '22023';
    END IF;

    UPDATE public.hitl_audit_logs
    SET status = p_status
    WHERE id = p_log_id
    RETURNING action INTO v_action;

    IF v_action IS NULL THEN
        RAISE EXCEPTION 'no HITL record with id %', p_log_id
            USING ERRCODE = 'P0002';
    END IF;

    IF p_status = 'Approved' AND p_action_payload IS NOT NULL THEN
        IF p_action_payload->>'action' = 'quarantine_app' THEN
            v_target_app := p_action_payload->>'target';
            IF v_target_app IS NOT NULL THEN
                UPDATE public.ecosystem_apps
                SET is_active = false
                WHERE app_id = v_target_app;
            END IF;
        END IF;
    END IF;

    RETURN jsonb_build_object('success', true, 'status', p_status, 'action', v_action);
END;
$$;

COMMENT ON FUNCTION public.resolve_hitl_action(UUID, TEXT, JSONB) IS
    'Records a HITL decision. Restricted to service_role and admin accounts; previously executable by anon.';

-- 3. Privileges ----------------------------------------------------------------
-- Postgres grants EXECUTE to PUBLIC by default, which is how anon reached both
-- functions over PostgREST. Close that, then grant only what is needed.
REVOKE ALL ON FUNCTION public.resolve_hitl_action(UUID, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_hitl_action(UUID, TEXT, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.resolve_hitl_action(UUID, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_hitl_action(UUID, TEXT, JSONB) TO service_role;
