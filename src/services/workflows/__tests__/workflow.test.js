import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runWorkflow, resumeWorkflow } from '../engine';
import api from '../../onyxAI/api';

vi.mock('../../onyxAI/api', () => ({
  default: {
    getWorkflows: vi.fn(),
    logWorkflowExecution: vi.fn(),
    getWorkflowExecutions: vi.fn()
  }
}));

// Mock supabase Client
vi.mock('../../supabaseClient', () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [{ id: 1, name: 'Test User' }],
          error: null
        })
      })
    })
  }
}));

describe('Workflow Engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs workflow, queries database, pauses, and resumes', async () => {
    const mockWorkflow = {
      id: 'test-wf',
      slug: 'test-wf',
      name: 'Test Workflow',
      definition: {
        steps: [
          { name: 'step1', type: 'query_database', config: { table: 'users', select: '*', match: { id: 1 } } },
          { name: 'step2', type: 'wait_for_event', config: { event_type: 'USER_APPROVED' } }
        ]
      }
    };

    api.getWorkflows.mockResolvedValue([mockWorkflow]);

    // First run - should pause
    const runResult = await runWorkflow('test-wf', 'system-user');
    expect(runResult.status).toBe('paused');
    expect(runResult.results[0].message).toContain('1 rows found');
    expect(runResult.results[1].status).toBe('paused');

    // Setup for resume
    api.getWorkflowExecutions.mockResolvedValue([
      { workflow_run_id: runResult.workflowRunId, status: 'paused', paused_at_step: 'step2', context: {} }
    ]);

    // Resume - supply the event it was waiting for
    const resumeResult = await resumeWorkflow('test-wf', runResult.workflowRunId, 'system-user', { event_type: 'USER_APPROVED' });
    expect(resumeResult.status).not.toBe('paused');
    expect(resumeResult.results.find(r => r.step === 'step2').message).toContain('Resumed after event: USER_APPROVED');
  });
});
