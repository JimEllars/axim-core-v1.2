-- Give `workflow_execution_logs` the paused state its writer already emits.
--
-- `src/services/workflows/engine.js` returns `{ status: 'paused' }` from a
-- `wait_for_event` step and persists it through
-- `api.logWorkflowExecution()`; `resumeWorkflow()` then looks the run up by
-- `status === 'paused'` and resumes it from `paused_at_step`. Wave 129 pointed
-- the History tab at this table and none of that worked:
--
--   1. `status` was CHECK-constrained to ('completed', 'failed'), so a paused
--      run could not be written as paused at all.
--   2. The writer put pauses in `events_ax2024` while the reader read
--      `workflow_execution_logs`, so `resumeWorkflow()` never found its run.
--   3. There was nowhere to record which step the run paused on.
--
-- The client-side writer and reader are fixed in the same change. This migration
-- is the half the database was missing: a legal 'paused' status and the two
-- columns the resume path needs.
--
-- The CHECK constraint is dropped by discovery rather than by an assumed name.
-- The original was declared inline (`status TEXT NOT NULL DEFAULT 'completed'
-- CHECK (status IN (...))`) so Postgres named it, and this repository has
-- already lost a day to a migration that assumed a constraint or policy name.

-- 1. Columns the resume path reads -------------------------------------------
ALTER TABLE public.workflow_execution_logs
    ADD COLUMN IF NOT EXISTS paused_at_step TEXT,
    ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ;

COMMENT ON COLUMN public.workflow_execution_logs.paused_at_step IS
    'Node id or step name the run stopped at. Read by resumeWorkflow() to restart the DAG from the right place.';
COMMENT ON COLUMN public.workflow_execution_logs.paused_at IS
    'When the run entered paused. NULL for runs that never paused.';

-- 2. Widen the status domain --------------------------------------------------
DO $$
DECLARE
    constraint_name text;
BEGIN
    FOR constraint_name IN
        SELECT con.conname
          FROM pg_constraint con
          JOIN pg_class     rel ON rel.oid = con.conrelid
          JOIN pg_namespace ns  ON ns.oid  = rel.relnamespace
         WHERE ns.nspname = 'public'
           AND rel.relname = 'workflow_execution_logs'
           AND con.contype = 'c'
           AND pg_get_constraintdef(con.oid) ILIKE '%status%'
    LOOP
        EXECUTE format(
            'ALTER TABLE public.workflow_execution_logs DROP CONSTRAINT %I',
            constraint_name
        );
    END LOOP;
END $$;

ALTER TABLE public.workflow_execution_logs
    ADD CONSTRAINT workflow_execution_logs_status_check
    CHECK (status IN ('completed', 'failed', 'paused'));

COMMENT ON CONSTRAINT workflow_execution_logs_status_check
    ON public.workflow_execution_logs IS
    'completed | failed | paused. paused is written by the client workflow engine''s wait_for_event step and cleared by resumeWorkflow().';

-- Partial index for the resume query: find runs waiting on an event without
-- scanning the completed history, which is the bulk of this table.
CREATE INDEX IF NOT EXISTS idx_workflow_execution_logs_paused
    ON public.workflow_execution_logs (paused_at)
    WHERE status = 'paused';
