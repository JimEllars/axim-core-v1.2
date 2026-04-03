import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before import
// Correct path: ../../../workflows/engine (from __tests__)
vi.mock('../../../workflows/engine', () => ({
  runWorkflow: vi.fn()
}));

vi.mock('../../../workflows/definitions', () => ({
  workflowDefinitions: {
    'test_workflow': { name: 'Test Workflow', description: 'A test workflow', steps: [] }
  }
}));

describe('Workflow Commands', () => {
  let commands;
  let mockEngine;

  beforeEach(async () => {
    vi.resetModules();
    mockEngine = await import('../../../workflows/engine');
    // Import the command module under test (one level up from __tests__)
    const module = await import('../workflowCommands');
    commands = module.default;
  });

  it('should list available workflows', () => {
    const listCommand = commands.find(c => c.name === 'listWorkflows');
    const result = listCommand.execute();
    expect(result).toContain('Test Workflow');
    expect(result).toContain('test_workflow');
  });

  it('should parse run command with arguments', () => {
    const runCommand = commands.find(c => c.name === 'runWorkflow');
    const input = 'run workflow test_workflow {"foo":"bar"}';
    const parsed = runCommand.parse(input);
    expect(parsed.slug).toBe('test_workflow');
    expect(parsed.argsString).toBe('{"foo":"bar"}');
  });

  it('should execute workflow with arguments', async () => {
    const runCommand = commands.find(c => c.name === 'runWorkflow');
    mockEngine.runWorkflow.mockResolvedValue({
      workflow: 'Test Workflow',
      results: [{ step: 'Step 1', success: true, message: 'Done' }]
    });

    const args = { slug: 'test_workflow', argsString: '{"key":"value"}' };
    const context = { userId: 'user-123' };

    const result = await runCommand.execute(args, context);

    expect(mockEngine.runWorkflow).toHaveBeenCalledWith('test_workflow', 'user-123', { key: 'value' });
    expect(result.type).toBe('success');
  });

  it('should return error if workflow not found', async () => {
    const runCommand = commands.find(c => c.name === 'runWorkflow');
    const args = { slug: 'non_existent_workflow' };
    const context = { userId: 'user-123' };

    const result = await runCommand.execute(args, context);
    expect(result.type).toBe('error');
    expect(result.message).toContain('not found');
  });
});
