// src/services/onyxAI/commands/__tests__/system.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCommand } from '../commandFactory';
import systemCommands from '../systemCommands';
import api from '../../api';
import { runWorkflow } from '../../../workflows/engine';
import { CommandValidationError } from '../../errors';

vi.mock('../../api');
vi.mock('../../../workflows/engine');

describe('OnyxAI System Commands', () => {

  describe('triggerWorkflow', () => {
    const command = systemCommands.find(c => c.name === 'triggerWorkflow');

    beforeEach(() => {
      vi.resetAllMocks();
    });

    it('should throw a validation error if WORKFLOW_NAME is missing', () => {
      const parsed = command.parse('trigger');
      expect(() => command.validate(parsed)).toThrow(CommandValidationError);
    });

    it('should pass validation if all required args are present', () => {
      const parsed = command.parse('trigger axim_project_initiation');
      expect(() => command.validate(parsed)).not.toThrow();
    });

    it('should call runWorkflow and return a success message', async () => {
      const args = { WORKFLOW_NAME: 'axim_project_initiation' };
      const mockWorkflows = [{ name: 'Axim Project Initiation', slug: 'axim_project_initiation' }];
      const mockResults = { results: [{ step: 'notify', success: true, message: 'Notified' }], workflowRunId: '123' };

      api.getWorkflows.mockResolvedValue(mockWorkflows);
      runWorkflow.mockResolvedValue(mockResults);

      const response = await command.execute(args, { userId: 'test-user' });

      expect(runWorkflow).toHaveBeenCalledWith('axim_project_initiation', 'test-user');
      expect(response).toContain(`🚀 Workflow "${args.WORKFLOW_NAME}" executed successfully.`);
    });

    it('should throw an error if workflow is not found', async () => {
      const args = { WORKFLOW_NAME: 'non_existent_workflow' };
      api.getWorkflows.mockResolvedValue([{ name: 'Existing Workflow', slug: 'existing_workflow' }]);
      await expect(command.execute(args, { userId: 'test-user' })).rejects.toThrow('Workflow "non_existent_workflow" not found.');
    });
  });

  // --- Other system command tests remain the same ---
  it('getSystemReport should call the correct api methods and return a formatted report', async () => {
    const command = systemCommands.find(cmd => cmd.name === 'getSystemReport');

    // Mock the Electron-specific global environment exposed by the preload script
    global.window.electronAPI = {
      invoke: vi.fn().mockResolvedValue({
        platform: 'test-os',
        uptime: 7200, // 2 hours
        cpuModel: 'Mock Processor',
        freeMemory: 8e9, // 8 GB
        totalMemory: 16e9, // 16 GB
      }),
    };

    api.getSystemStats.mockResolvedValue({ totalContacts: 1, totalEvents: 1, totalAPIs: 1 });
    api.getAPIStats.mockResolvedValue({ logs: [] });
    api.getProjectManagementStats.mockResolvedValue({ totalProjects: 1, totalTasks: 1, totalWorkflows: 1 });

    const report = await command.execute({}, { userId: 'test-user' });

    expect(api.getSystemStats).toHaveBeenCalledWith('test-user');
    expect(api.getProjectManagementStats).toHaveBeenCalledWith('test-user');
    expect(global.window.electronAPI.invoke).toHaveBeenCalledWith('get-system-info');
    expect(report).toContain('SYSTEM HEALTH REPORT');
    expect(report).toContain('Platform: test-os');
    expect(report).toContain('Uptime: 2.00 hours');

    // Clean up the mock to avoid affecting other tests
    delete global.window.electronAPI;
  });

  it('getAIStatus should return the AI status and version', () => {
    const command = systemCommands.find(cmd => cmd.name === 'getAIStatus');
    const status = command.execute();
    expect(status).toContain('Onyx AI');
  });

  it('clear should call the aximCore method and return the correct object', () => {
    const command = systemCommands.find(cmd => cmd.name === 'clear');
    const mockAximCore = {
      clearConversationHistory: vi.fn(),
    };
    const result = command.execute({}, { aximCore: mockAximCore });
    expect(mockAximCore.clearConversationHistory).toHaveBeenCalled();
    expect(result).toEqual({ type: '__CLEAR_CHAT__' });
  });

  it('uuid should return a valid v4 UUID', () => {
    const command = systemCommands.find(cmd => cmd.name === 'uuid');
    const result = command.execute();
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    // Extract the UUID from the response string
    const extractedUuid = result.replace('Generated UUID: ', '');
    expect(extractedUuid).toMatch(uuidRegex);
  });

  describe('help', () => {
    const command = systemCommands.find(cmd => cmd.name === 'help');
    const allCommands = [
        { name: 'test', description: 'Test command', keywords: ['test', 't'], category: 'Test', usage: 'test usage', entities: [], aliases: [], isDefault: false, execute: () => {}, parse: () => ({}), validate: () => {} },
        { name: 'another', description: 'Another command', keywords: ['another'], category: 'Another', usage: 'another usage', entities: [], aliases: [], isDefault: false, execute: () => {}, parse: () => ({}), validate: () => {} },
    ];

    it('should return a list of all commands when no specific command is given', () => {
        const help = command.execute({ COMMAND_NAME: undefined }, { allCommands });
        expect(help).toContain('--- Test Commands ---');
        expect(help).toContain('--- Another Commands ---');
        expect(help).toContain('• test');
        expect(help).toContain('• another');
    });

    it('should return details for a specific command when a command name is provided', () => {
        const help = command.execute({ COMMAND_NAME: 'test' }, { allCommands });
        expect(help).toContain('======= HELP: test =======');
        expect(help).toContain('Description: Test command');
        expect(help).toContain('Usage: test usage');
        expect(help).toContain('Keywords: test, t');
    });

    it('should return details for a specific command when an alias is provided', () => {
        const help = command.execute({ COMMAND_NAME: 't' }, { allCommands });
        expect(help).toContain('======= HELP: test =======');
    });

    it('should return a "not found" message for an unknown command', () => {
        const help = command.execute({ COMMAND_NAME: 'unknown' }, { allCommands });
        expect(help).toContain('Command "unknown" not found.');
    });

    it('should return details for a specific command when a keyword is provided', () => {
      const help = command.execute({ COMMAND_NAME: 't' }, { allCommands });
      expect(help).toContain('======= HELP: test =======');
    });
});

  it('getSystemReport should return a fallback message if not in Electron environment', async () => {
    const command = systemCommands.find(cmd => cmd.name === 'getSystemReport');
    // Ensure the global mock is not present
    if (global.window.electronAPI) delete global.window.electronAPI;

    const report = await command.execute({}, { userId: 'test-user' });
    expect(report).toBe("System report is only available in the desktop application.");
  });

  describe('exportChatlog', () => {
    const command = systemCommands.find(c => c.name === 'exportChatlog');

    beforeEach(() => {
      vi.resetAllMocks();
    });

    it('should return a file_download object with JSON content', async () => {
      const mockAximCore = {
        userId: 'test-user',
        conversationId: 'test-convo',
      };
      const mockHistory = [{ command: 'test', response: 'ok' }];
      api.getChatHistoryForUser.mockResolvedValue(mockHistory);

      const result = await command.execute({}, { aximCore: mockAximCore });

      expect(api.getChatHistoryForUser).toHaveBeenCalledWith('test-user', 'test-convo');
      expect(result.type).toBe('file_download');
      expect(result.filename).toMatch(/axim-chatlog-.*\.json/);
      expect(result.content).toBe(JSON.stringify(mockHistory, null, 2));
    });

    it('should return a message if no history is found', async () => {
      const mockAximCore = {
        userId: 'test-user',
        conversationId: 'test-convo',
      };
      api.getChatHistoryForUser.mockResolvedValue([]);

      const result = await command.execute({}, { aximCore: mockAximCore });
      expect(result).toBe('No chat history available to export.');
    });

    it('should throw an error if aximCore is not available', async () => {
       await expect(command.execute({}, {})).rejects.toThrow('AximCore service is not available or user is not initialized.');
    });
  });

  describe('systemHealthCheck', () => {
    const command = systemCommands.find(c => c.name === 'systemHealthCheck');

    beforeEach(() => {
      vi.resetAllMocks();
      if (global.window.electronAPI) delete global.window.electronAPI;
    });

    it('should return health check results including host info if in Electron environment', async () => {
      api.checkSystemHealth.mockResolvedValue({
        results: [
          { name: 'API', status: '✅ ONLINE', latency: '120ms' },
          { name: 'Database', status: '✅ ONLINE' }
        ]
      });

      global.window.electronAPI = {
        invoke: vi.fn().mockResolvedValue({
          platform: 'test-platform',
          uptime: 3600 // 1 hour
        })
      };

      const result = await command.execute();

      expect(api.checkSystemHealth).toHaveBeenCalled();
      expect(global.window.electronAPI.invoke).toHaveBeenCalledWith('get-system-info');
      expect(result).toContain('======= SYSTEM HEALTH CHECK =======');
      expect(result).toContain('• API: ✅ ONLINE (Latency: 120ms)');
      expect(result).toContain('--- Local Host ---');
      expect(result).toContain('💻 Platform: test-platform');
      expect(result).toContain('⏱️ Uptime: 1.00 hours');
    });

    it('should handle missing error path for system health check invoke rejection', async () => {
      // Setup mock to successfully return API health
      api.checkSystemHealth.mockResolvedValue({
        results: [{ name: 'API', status: '✅ ONLINE' }]
      });

      // Simulate a rejection from the invoke call to trigger the catch block
      global.window.electronAPI = {
        invoke: vi.fn().mockRejectedValue(new Error('electronAPI invoke failed'))
      };

      const result = await command.execute();

      // Verify the catch block successfully ignores the error and returns the report output
      expect(api.checkSystemHealth).toHaveBeenCalled();
      expect(global.window.electronAPI.invoke).toHaveBeenCalledWith('get-system-info');
      expect(result).toContain('======= SYSTEM HEALTH CHECK =======');
      expect(result).not.toContain('--- Local Host ---');
      expect(result).toContain('===================================');
      expect(result).toContain('API: ✅ ONLINE');
    });

    it('should return health check results without host info if not in Electron environment', async () => {
      api.checkSystemHealth.mockResolvedValue({
        results: [{ name: 'API', status: '✅ ONLINE' }]
      });

      // Ensure electronAPI is undefined
      if (global.window.electronAPI) delete global.window.electronAPI;

      const result = await command.execute();

      expect(api.checkSystemHealth).toHaveBeenCalled();
      expect(result).toContain('======= SYSTEM HEALTH CHECK =======');
      expect(result).not.toContain('--- Local Host ---');
    });
  });
});
