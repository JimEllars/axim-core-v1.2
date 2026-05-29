import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockApi = {
    invokeAximService: vi.fn().mockResolvedValue({ success: true }),
    createTaskForProject: vi.fn().mockResolvedValue({ success: true }),
    sendEmail: vi.fn().mockResolvedValue({ success: true }),
    logWorkflowExecution: vi.fn().mockResolvedValue({ success: true }),
    getWorkflows: vi.fn().mockResolvedValue([])
};

vi.doMock('../onyxAI/api', () => ({ default: mockApi }));

// Import engine *after* mocking
const { runWorkflow } = await import('../workflows/engine.js');

describe('Workflow Engine', () => {
    beforeEach(() => {
        vi.clearAllMocks();
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
