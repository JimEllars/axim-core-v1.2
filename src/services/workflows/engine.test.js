import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runWorkflow } from './engine';
import { workflowDefinitions } from './definitions';
import api from '../onyxAI/api';
import { generateContent } from '../onyxAI/llm';

// Mock dependencies
vi.mock('./definitions', () => ({
  workflowDefinitions: {
    test_workflow: {
      name: 'Test Workflow',
      steps: [
        { name: 'Step 1', action: vi.fn().mockResolvedValue({ message: 'Step 1 OK', data: 'A' }) },
        { name: 'Step 2', action: vi.fn().mockResolvedValue({ message: 'Step 2 OK' }) },
      ],
    },
    failing_workflow: {
      name: 'Failing Workflow',
      steps: [
        { name: 'Good Step', action: vi.fn().mockResolvedValue({ message: 'Good Step OK' }) },
        { name: 'Bad Step', action: vi.fn().mockRejectedValue(new Error('Something went wrong')) },
        { name: 'Never Run', action: vi.fn() },
      ],
    },
  },
}));

vi.mock('../onyxAI/api');

describe('Workflow Engine', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    vi.clearAllMocks();

    // Explicitly set up the mocks for the failing workflow before each test to ensure they behave as expected.
    // This robustness prevents issues where mocks might be reset or behave unexpectedly in different environments.
    const failingSteps = workflowDefinitions.failing_workflow.steps;
    failingSteps[0].action.mockResolvedValue({ message: 'Good Step OK' });
    failingSteps[1].action.mockImplementation(() => Promise.reject(new Error('Something went wrong')));
    failingSteps[2].action.mockImplementation(async () => {});

    // Suppress console.error for tests that are expected to throw and log errors.
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore the mock after each test to ensure a clean state.
    consoleErrorSpy.mockRestore();
  });

  it('should run a successful workflow and log the results', async () => {
    const { workflow, results } = await runWorkflow('test_workflow', 'test-user');

    expect(workflow).toBe('Test Workflow');
    expect(results).toHaveLength(2);
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(true);

    // Check that steps were called in order
    const step1 = workflowDefinitions.test_workflow.steps[0].action;
    const step2 = workflowDefinitions.test_workflow.steps[1].action;
    expect(step1).toHaveBeenCalledWith({ workflowRunId: expect.any(String), userId: 'test-user' });
    expect(step2).toHaveBeenCalledWith({
      message: 'Step 1 OK',
      data: 'A',
      workflowRunId: expect.any(String),
      userId: 'test-user'
    });

    // Check that the execution was logged
    expect(api.logWorkflowExecution).toHaveBeenCalledWith('Test Workflow', expect.any(Object), 'test-user');
  });

  it('should handle a failing workflow and stop execution', async () => {
    const { workflow, results } = await runWorkflow('failing_workflow', 'test-user');

    expect(workflow).toBe('Failing Workflow');
    expect(results).toHaveLength(2);
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(false);
    expect(results[1].message).toBe('Something went wrong');

    // Check that the third step was not executed
    expect(workflowDefinitions.failing_workflow.steps[2].action).not.toHaveBeenCalled();

    // Check that the execution was logged
    expect(api.logWorkflowExecution).toHaveBeenCalled();
  });

  it('should throw an error if the workflow is not found', async () => {
    api.getWorkflows.mockResolvedValue([]);
    await expect(runWorkflow('non_existent_workflow')).rejects.toThrow(
      'Workflow "non_existent_workflow" not found.'
    );
  });
});
