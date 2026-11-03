-- Workflow persistence: definition column + execution log table
--
-- Two gaps closed here, both found by inspection of the live code rather than
-- from notes:
--
--  1. workflows_ax2024 has no `definition` column. It is created in
--     20250101000000_consolidated_schema.sql with (id, name, description, slug,
--     created_at, user_id) only, yet three call sites read/write a graph:
--         src/services/supabaseApiService.js  getWorkflows / saveWorkflow
--         supabase/functions/trigger-workflow  workflow.definition
--     Every one of those round-trips fails with 42703 (undefined_column), so
--     the visual builder could neither load nor persist a workflow graph.
--
--  2. workflow_execution_logs is written by supabase/functions/trigger-workflow
--     but is not defined by any migration. The insert fails silently (the error
--     is console.error'd and the run is still reported as "completed").
--
-- Idempotent by design: safe to re-run, no data loss, additive only.

-- 1. workflows_ax2024.definition ---------------------------------------------
ALTER TABLE public.workflows_ax2024
  ADD COLUMN IF NOT EXISTS definition JSONB NOT NULL DEFAULT '{"nodes": [], "edges": []}'::jsonb;

ALTER TABLE public.workflows_ax2024
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Defensive backfill for rows that predate the column (or were written NULL by
-- a client that bypassed the default).
UPDATE public.workflows_ax2024
SET definition = '{"nodes": [], "edges": []}'::jsonb
WHERE definition IS NULL;

COMMENT ON COLUMN public.workflows_ax2024.definition IS
  'React Flow graph: { nodes: [{id,type,position,data}], edges: [{id,source,target}] }. Consumed by the trigger-workflow DAG runner and the WorkflowBuilder UI.';

-- Owners may create/update their own workflows. This is additive on top of the
-- existing admin ALL policy and the global read policy; it does not widen access
-- for anyone else.
DROP POLICY IF EXISTS "Allow owner write on workflows" ON public.workflows_ax2024;
CREATE POLICY "Allow owner write on workflows" ON public.workflows_ax2024
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 2. workflow_execution_logs --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workflow_execution_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID REFERENCES public.workflows_ax2024(id) ON DELETE SET NULL,
    workflow_run_id TEXT,
    workflow_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'completed'
        CHECK (status IN ('completed', 'failed')),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    execution_context JSONB NOT NULL DEFAULT '{}'::jsonb,
    node_results JSONB NOT NULL DEFAULT '[]'::jsonb,
    error_message TEXT,
    duration_ms INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per run. The runner generates workflow_run_id up front, so a retried
-- dispatch cannot double-log the same execution.
CREATE UNIQUE INDEX IF NOT EXISTS idx_workflow_execution_logs_run_id
  ON public.workflow_execution_logs (workflow_run_id)
  WHERE workflow_run_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_workflow_execution_logs_workflow_created
  ON public.workflow_execution_logs (workflow_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_workflow_execution_logs_status_created
  ON public.workflow_execution_logs (status, created_at DESC);

ALTER TABLE public.workflow_execution_logs ENABLE ROW LEVEL SECURITY;
-- FORCE so the table owner is also subject to RLS; only service_role bypasses.
ALTER TABLE public.workflow_execution_logs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service role full access on workflow_execution_logs"
  ON public.workflow_execution_logs;
CREATE POLICY "Allow service role full access on workflow_execution_logs"
  ON public.workflow_execution_logs
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Allow owner read on workflow_execution_logs"
  ON public.workflow_execution_logs;
CREATE POLICY "Allow owner read on workflow_execution_logs"
  ON public.workflow_execution_logs
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Allow admin read on workflow_execution_logs"
  ON public.workflow_execution_logs;
CREATE POLICY "Allow admin read on workflow_execution_logs"
  ON public.workflow_execution_logs
  FOR SELECT
  USING (public.is_admin());

-- Writes are service-role only. Supabase grants ALL on new public tables to
-- anon/authenticated by default, so revoke explicitly; RLS with no write policy
-- would already deny, but the grant removal makes the intent unambiguous.
REVOKE INSERT, UPDATE, DELETE ON public.workflow_execution_logs FROM anon, authenticated;
GRANT SELECT ON public.workflow_execution_logs TO authenticated;

COMMENT ON TABLE public.workflow_execution_logs IS
  'One row per trigger-workflow DAG run. Written exclusively by the trigger-workflow Edge Function under the service role.';

-- 3. robot_simulation_runs ---------------------------------------------------
-- The `robot_sim_run` action node needs somewhere to record a queued run. The
-- robotics schema (20280112000000) defines projects, fleet nodes, policies,
-- telemetry and fault logs - but no simulation-run table, so the action had no
-- real persistence target.
CREATE TABLE IF NOT EXISTS public.robot_simulation_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.robot_projects(id) ON DELETE CASCADE,
    scene_type TEXT NOT NULL DEFAULT 'default',
    duration_sec INTEGER NOT NULL CHECK (duration_sec > 0),
    status TEXT NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
    params JSONB NOT NULL DEFAULT '{}'::jsonb,
    workflow_run_id TEXT,
    exit_state TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_robot_simulation_runs_project_created
  ON public.robot_simulation_runs (project_id, created_at DESC);

ALTER TABLE public.robot_simulation_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service role full access on robot_simulation_runs"
  ON public.robot_simulation_runs;
CREATE POLICY "Allow service role full access on robot_simulation_runs"
  ON public.robot_simulation_runs
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Allow authenticated read on robot_simulation_runs"
  ON public.robot_simulation_runs;
CREATE POLICY "Allow authenticated read on robot_simulation_runs"
  ON public.robot_simulation_runs
  FOR SELECT
  USING (auth.role() = 'authenticated');
