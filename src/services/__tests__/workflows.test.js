import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockApi = {
    invokeAximService: vi.fn().mockResolvedValue({ success: true }),
    createTaskForProject: vi.fn().mockResolvedValue({ success: true }),
    sendEmail: vi.fn().mockResolvedValue({ success: true }),
    logWorkflowExecution: vi.fn().mockResolvedValue({ success: true }),
    getWorkflows: vi.fn().mockResolvedValue([]),
    getWorkflowExecutions: vi.fn().mockResolvedValue([])
};

vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({})
})));

vi.doMock('../onyxAI/api', () => ({ default: mockApi }));

describe('Workflow Engine', () => {
    let runWorkflow;

    beforeEach(async () => {
        vi.clearAllMocks();
        // Import engine *after* mocking
        const engine = await import('../workflows/engine.js');
        runWorkflow = engine.runWorkflow;
    });

    it('should process a mocked data plane payload', async () => {
        const context = {
            eventData: {
                name: 'Marcus Vance',
                email: 'm.vance_demo@example.com',
                phone: '+1-555-019-8372',
                affiliate_program: 'ADT',
                intent: 'High'
            }
        };

        const result = await runWorkflow('NEW_AFFILIATE_LEAD', 'system', context);

        expect(result.status).toBe('paused'); // Because of the wait step
        expect(mockApi.logWorkflowExecution).toHaveBeenCalled();
    });

    it('should resume a paused workflow upon receiving the awaited event', async () => {
        // Mock a previously paused workflow execution
        const runId = 'wf_run_mocked_id';
        const workflowName = 'NEW_AFFILIATE_LEAD';
        const pausedStepName = 'Wait for Event';
        const context = {
           workflowRunId: runId,
           userId: 'system'
        };

        mockApi.getWorkflowExecutions.mockResolvedValue([
            {
               workflow_run_id: runId,
               workflow_name: workflowName,
               status: 'paused',
               paused_at_step: pausedStepName,
               context: context
            }
        ]);

        const eventData = { event_type: 'email_opened_or_clicked', contract_id: '123' };

        // We export resumeWorkflow so we can test it directly or test listenForWorkflowEvents
        const engine = await import('../workflows/engine.js');
        const result = await engine.resumeWorkflow(workflowName, runId, 'system', eventData);

        expect(result.status).not.toBe('paused');
        expect(mockApi.logWorkflowExecution).toHaveBeenCalled();
    });

});
