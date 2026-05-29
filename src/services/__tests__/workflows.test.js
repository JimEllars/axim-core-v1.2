import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockApi = {
    invokeAximService: vi.fn().mockResolvedValue({ success: true }),
    createTaskForProject: vi.fn().mockResolvedValue({ success: true }),
    sendEmail: vi.fn().mockResolvedValue({ success: true }),
    logWorkflowExecution: vi.fn().mockResolvedValue({ success: true }),
    getWorkflows: vi.fn().mockResolvedValue([])
};

vi.doMock('../onyxAI/api', () => ({ default: mockApi }));

describe('Workflow Engine', () => {
    let runWorkflow;

    beforeEach(async () => {
        vi.clearAllMocks();
        // Import engine *after* mocking
        const engine = await import('../workflows/engine.js');
        runWorkflow = engine.runWorkflow;
    });

    it('should process a mocked webhook payload', async () => {
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
        expect(mockApi.invokeAximService).toHaveBeenCalled();
        expect(mockApi.logWorkflowExecution).toHaveBeenCalled();
    });
});
