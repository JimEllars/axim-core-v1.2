-- Simulation queue consumer support.
--
-- Context: `trigger-workflow` inserts a `robot_simulation_runs` row with
-- `status = 'queued'` for every `robot_sim_run` action node and returns. Nothing
-- ever read that queue, so the rows accumulated for ever and the "simulation
-- queued" result in the execution log described work that would never happen.
-- `robotics-sim-drainer` is the consumer; this migration gives it what it needs
-- to claim work safely.
--
-- Two additions:
--
--   1. `claimed_at` — when a run moved out of 'queued'. Without it a row stuck
--      in 'running' after a crashed invocation is indistinguishable from one
--      that is legitimately in flight, and there is no way to write a reaper.
--
--   2. `claim_robot_simulation_runs(p_limit)` — an atomic claim.
--
-- Why an RPC rather than PostgREST: claiming is `UPDATE ... WHERE status =
-- 'queued' ... RETURNING *`, and a `select` followed by a separate `update`
-- from the client has a race. Two concurrent drainer invocations (cron firing
-- while an operator triggers one by hand) both read the same 'queued' rows and
-- both dispatch them, so one simulation is billed and reported twice.
-- `FOR UPDATE SKIP LOCKED` inside a single statement is the correct primitive
-- and it cannot be expressed through the REST API.

-- 1. claimed_at --------------------------------------------------------------
ALTER TABLE public.robot_simulation_runs
    ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.robot_simulation_runs.claimed_at IS
    'When the drainer moved this run out of queued. A stale value with status=running means an invocation died mid-dispatch and the run needs reaping.';

-- Supports the claim's `WHERE status = 'queued' ORDER BY created_at` scan
-- without walking the whole history of finished runs.
CREATE INDEX IF NOT EXISTS idx_robot_simulation_runs_status_created
    ON public.robot_simulation_runs (status, created_at)
    WHERE status = 'queued';

-- 2. Atomic claim ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_robot_simulation_runs(p_limit integer DEFAULT 5)
RETURNS SETOF public.robot_simulation_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    -- Clamp inside the function: the drainer bounds it too, but a direct caller
    -- (psql, another function) must not be able to claim ten thousand rows and
    -- hold the queue for minutes.
    v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 5), 1), 25);
BEGIN
    RETURN QUERY
    WITH claimed AS (
        SELECT r.id
          FROM public.robot_simulation_runs r
         WHERE r.status = 'queued'
         ORDER BY r.created_at
         FOR UPDATE SKIP LOCKED
         LIMIT v_limit
    )
    UPDATE public.robot_simulation_runs target
       SET status     = 'running',
           claimed_at = now()
      FROM claimed
     WHERE target.id = claimed.id
    RETURNING target.*;
END;
$$;

COMMENT ON FUNCTION public.claim_robot_simulation_runs(integer) IS
    'Atomically move up to p_limit (1..25) queued simulation runs to running and return them. FOR UPDATE SKIP LOCKED makes concurrent drainers safe.';

-- SECURITY DEFINER is required so the claim bypasses RLS for the service role
-- consistently, which also makes it a privilege boundary: only the service role
-- may execute it. Unlike the read policies on this table, `authenticated` and
-- `anon` must not be able to move queue state.
REVOKE ALL ON FUNCTION public.claim_robot_simulation_runs(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_robot_simulation_runs(integer) FROM anon;
REVOKE ALL ON FUNCTION public.claim_robot_simulation_runs(integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_robot_simulation_runs(integer) TO service_role;

-- 3. Stuck-run reaper --------------------------------------------------------
-- A drainer invocation that dies between the claim and the completion write
-- leaves a row in 'running' with a `claimed_at` that never advances. Returning
-- those to 'queued' is what lets the queue make progress again, and it is
-- bounded by age so an in-flight run is never yanked from under a live worker.
CREATE OR REPLACE FUNCTION public.reap_stale_robot_simulation_runs(
    p_stale_after_sec integer DEFAULT 1800
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_age integer := GREATEST(COALESCE(p_stale_after_sec, 1800), 60);
    v_count integer;
BEGIN
    WITH reaped AS (
        UPDATE public.robot_simulation_runs
           SET status     = 'queued',
               claimed_at = NULL
         WHERE status = 'running'
           AND claimed_at IS NOT NULL
           AND claimed_at < now() - make_interval(secs => v_age)
        RETURNING 1
    )
    SELECT count(*) INTO v_count FROM reaped;

    RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.reap_stale_robot_simulation_runs(integer) IS
    'Return runs stuck in running for longer than p_stale_after_sec (default 1800, min 60) to queued. Returns the number requeued.';

REVOKE ALL ON FUNCTION public.reap_stale_robot_simulation_runs(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reap_stale_robot_simulation_runs(integer) FROM anon;
REVOKE ALL ON FUNCTION public.reap_stale_robot_simulation_runs(integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reap_stale_robot_simulation_runs(integer) TO service_role;
