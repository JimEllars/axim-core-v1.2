/**
 * Proving tests for the workflow pause/resume round trip.
 *
 * The defect these pin down, in four parts:
 *
 *   1. `workflow_execution_logs.status` was CHECK-constrained to
 *      ('completed', 'failed'), so the `paused` status the engine has always
 *      emitted could not be stored at all.
 *   2. `logWorkflowExecution()` wrote pauses to `events_ax2024` while
 *      `getWorkflowExecutions()` read `workflow_execution_logs`, so
 *      `resumeWorkflow()` never found its run.
 *   3. `normalizeExecutionLogRow()` coerced any non-'failed' status to
 *      'completed', so even a stored pause would have read back as completed.
 *   4. `resumeWorkflow()` read `runData.context`, but the normalised row's field
 *      is `execution_context`. The restart context was always `undefined`.
 *
 * The round-trip test is the important one: it feeds a payload through the real
 * writer mapping, the real reader normaliser, and the real `resumeWorkflow()`,
 * so a future rename on either side fails here instead of at runtime.
 *
 * The earlier test in `src/services/workflows/__tests__/workflow.test.js` mocked
 * `getWorkflowExecutions()` to return `{ status: 'paused', context: {}, ... }` —
 * a row shape the database could not produce. It passed while the feature was
 * entirely broken.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../src/services/onyxAI/api', () => ({
  default: {
    getWorkflows: vi.fn(),
    logWorkflowExecution: vi.fn(),
    getWorkflowExecutions: vi.fn(),
  },
}));

vi.mock('../src/services/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

const { default: api } = await import('../src/services/onyxAI/api');
const { runWorkflow, resumeWorkflow } = await import('../src/services/workflows/engine');
const { normalizeExecutionLogRow, workflowExecutionLogRow, WORKFLOW_EXECUTION_STATUSES } =
  await import('../src/services/supabaseApiService');

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Writer mapping
// ---------------------------------------------------------------------------

describe('workflowExecutionLogRow', () => {
  it('translates the engine payload onto the table columns', () => {
    const row = workflowExecutionLogRow(
      'Audio Intelligence Pipeline',
      {
        status: 'completed',
        workflowRunId: 'run-1',
        results: [{ step: 'transcribe', success: true }],
        context: { transcript: 'hello' },
      },
      '2f1e0d3c-4b5a-6978-8a9b-0c1d2e3f4a5b',
    );

    expect(row).toMatchObject({
      workflow_run_id: 'run-1',
      workflow_name: 'Audio Intelligence Pipeline',
      status: 'completed',
      user_id: '2f1e0d3c-4b5a-6978-8a9b-0c1d2e3f4a5b',
      execution_context: { transcript: 'hello' },
      node_results: [{ step: 'transcribe', success: true }],
    });
  });

  // The column the old code could not write.
  it('preserves the paused status and records the step', () => {
    const row = workflowExecutionLogRow('wf', {
      status: 'paused',
      workflowRunId: 'run-2',
      results: [],
      paused_at_step: 'wait_for_approval',
      context: { orderId: 41 },
    });

    expect(row.status).toBe('paused');
    expect(row.paused_at_step).toBe('wait_for_approval');
    expect(row.paused_at).toEqual(expect.any(String));
    expect(Number.isNaN(Date.parse(row.paused_at))).toBe(false);
  });

  it('clears the pause fields for a completed run', () => {
    const row = workflowExecutionLogRow('wf', { status: 'completed', workflowRunId: 'run-3' });
    expect(row.paused_at_step).toBeNull();
    expect(row.paused_at).toBeNull();
  });

  // `workflow_execution_logs.user_id` is a UUID FK; the engine passes the literal
  // 'system' for background runs, which aborts the insert with 22P02.
  it('drops a non-UUID actor instead of aborting the insert', () => {
    expect(workflowExecutionLogRow('wf', { status: 'completed' }, 'system').user_id).toBeNull();
    expect(workflowExecutionLogRow('wf', { status: 'completed' }).user_id).toBeNull();
  });

  it('defaults an unknown status to completed', () => {
    expect(workflowExecutionLogRow('wf', { status: 'banana' }).status).toBe('completed');
  });
});

// ---------------------------------------------------------------------------
// Reader normalisation
// ---------------------------------------------------------------------------

describe('normalizeExecutionLogRow', () => {
  it('accepts every status the table allows', () => {
    expect(WORKFLOW_EXECUTION_STATUSES).toEqual(['completed', 'failed', 'paused']);
  });

  // The coercion that hid the bug.
  it('does not report a paused run as completed', () => {
    const row = normalizeExecutionLogRow({
      workflow_run_id: 'run-2',
      status: 'paused',
      paused_at_step: 'wait_for_approval',
      execution_context: { orderId: 41 },
    });

    expect(row.status).toBe('paused');
    expect(row.paused_at_step).toBe('wait_for_approval');
    expect(row.execution_context).toEqual({ orderId: 41 });
  });

  it('keeps failed as failed', () => {
    expect(normalizeExecutionLogRow({ status: 'failed' }).status).toBe('failed');
  });

  it('falls back to completed for an unrecognised status', () => {
    expect(normalizeExecutionLogRow({ status: 'wat' }).status).toBe('completed');
  });
});

// ---------------------------------------------------------------------------
// Round trip: log a pause, read it back, resume from it
// ---------------------------------------------------------------------------

describe('pause -> log -> read -> resume', () => {
  const pausedPayload = {
    status: 'paused',
    workflowRunId: 'run-42',
    results: [{ step: 'collect', success: true }],
    paused_at_step: 'wait_for_approval',
    context: { orderId: 41, collected: true },
  };

  const pausedWorkflow = {
    id: 'approval-wf',
    slug: 'approval-wf',
    name: 'Approval Workflow',
    definition: {
      steps: [
        {
          name: 'wait_for_approval',
          type: 'wait_for_event',
          config: { event_type: 'USER_APPROVED' },
        },
      ],
    },
  };

  it('resumes with the context and step the writer recorded', async () => {
    // The database row the writer would produce, read back through the reader.
    const persisted = workflowExecutionLogRow('Approval Workflow', pausedPayload);
    const runRow = normalizeExecutionLogRow({ id: 'row-1', ...persisted });

    expect(runRow.status).toBe('paused');

    api.getWorkflowExecutions.mockResolvedValue([runRow]);
    api.getWorkflows.mockResolvedValue([pausedWorkflow]);

    const result = await resumeWorkflow('approval-wf', 'run-42', 'user-1', {
      event_type: 'USER_APPROVED',
    });

    expect(result.status).not.toBe('paused');
    const approvalStep = result.results.find((entry) => entry.step === 'wait_for_approval');
    expect(approvalStep.message).toContain('Resumed after event: USER_APPROVED');
  });

  it('the resumed run is logged as completed against the same run id', async () => {
    const persisted = workflowExecutionLogRow('Approval Workflow', pausedPayload);
    api.getWorkflowExecutions.mockResolvedValue([
      normalizeExecutionLogRow({ id: 'row-1', ...persisted }),
    ]);
    api.getWorkflows.mockResolvedValue([pausedWorkflow]);

    await resumeWorkflow('approval-wf', 'run-42', 'user-1', { event_type: 'USER_APPROVED' });

    const statuses = api.logWorkflowExecution.mock.calls.map((call) => call[1].status);
    expect(statuses).toContain('completed');
    expect(api.logWorkflowExecution).toHaveBeenCalledWith(
      'Approval Workflow',
      expect.objectContaining({ status: 'completed', workflowRunId: 'run-42' }),
      'user-1',
    );
  });

  it('refuses to resume a run that is not paused', async () => {
    api.getWorkflowExecutions.mockResolvedValue([
      { workflow_run_id: 'run-99', status: 'completed', execution_context: {} },
    ]);

    await expect(resumeWorkflow('approval-wf', 'run-99', 'user-1', {})).rejects.toThrow(
      /is not paused \(status: completed\)/,
    );
    // No second execution of an already-finished DAG.
    expect(api.logWorkflowExecution).not.toHaveBeenCalled();
  });

  it('refuses to resume a run it cannot find', async () => {
    api.getWorkflowExecutions.mockResolvedValue([]);
    await expect(resumeWorkflow('approval-wf', 'missing', 'user-1', {})).rejects.toThrow(
      /not found/,
    );
  });

  /**
   * The engine half: a `wait_for_event` step must pause, and the pause must be
   * written with a step name and the accumulated context, or the resume has
   * nothing to work from.
   */
  it('runWorkflow persists the pause with a step name and the context', async () => {
    api.getWorkflows.mockResolvedValue([pausedWorkflow]);

    const result = await runWorkflow('approval-wf', 'user-1', { orderId: 7 });

    expect(result.status).toBe('paused');

    const pauseCall = api.logWorkflowExecution.mock.calls.find(
      (call) => call[1].status === 'paused',
    );
    expect(pauseCall).toBeDefined();
    expect(pauseCall[1].paused_at_step).toBe('wait_for_approval');

    // The row that pause produces is resumable.
    const row = workflowExecutionLogRow('Approval Workflow', pauseCall[1], 'user-1');
    expect(row.status).toBe('paused');
    expect(row.paused_at_step).toBe('wait_for_approval');
    expect(row.execution_context).toMatchObject({ orderId: 7 });
  });
});
