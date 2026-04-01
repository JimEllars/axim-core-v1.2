import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies at the top level.
vi.mock('../../../config');
vi.mock('../../gcpApiService', () => ({
  default: {
    initialize: vi.fn(),
    addContact: vi.fn(),
    queryDatabase: vi.fn(),
    listAllContacts: vi.fn(),
    getSystemStats: vi.fn(),
    logAIInteraction: vi.fn(),
    initiateTranscription: vi.fn(),
    deleteUser: vi.fn(),
    invokeAximService: vi.fn(),
    searchChatHistory: vi.fn(),
  },
}));
vi.mock('../../supabaseApiService');

const mockSupabase = { client: 'mock' }; // A mock supabase client object

describe('ApiService Facade', () => {
  let api;
  let config;
  let gcpApiService;
  let supabaseApiService;

  beforeEach(async () => {
    vi.resetModules();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});

    config = (await import('../../../config')).default;
    gcpApiService = (await import('../../gcpApiService')).default;
    supabaseApiService = (await import('../../supabaseApiService')).default;

    // Ensure mocks return promises
    gcpApiService.queryDatabase.mockResolvedValue([]);
    supabaseApiService.queryDatabase.mockResolvedValue([]);

    api = (await import('../api')).default;
  });

  describe('Initialization', () => {
    it('should initialize both and use SupabaseApiService as primary when dataSource is "supabase"', async () => {
      config.dataSource = 'supabase';
      await api.initialize(mockSupabase);

      expect(supabaseApiService.initialize).toHaveBeenCalledWith(mockSupabase, expect.anything(), expect.anything());
      expect(gcpApiService.initialize).toHaveBeenCalled();

      expect(api.primaryService).toBe(supabaseApiService);
      expect(api.secondaryService).toBe(gcpApiService);
    });

    it('should initialize both and use GcpApiService as primary when dataSource is "gcp"', async () => {
      config.dataSource = 'gcp';
      await api.initialize(mockSupabase);

      expect(gcpApiService.initialize).toHaveBeenCalled();
      expect(supabaseApiService.initialize).toHaveBeenCalled();

      expect(api.primaryService).toBe(gcpApiService);
      expect(api.secondaryService).toBe(supabaseApiService);
    });
  });

  describe('Fallback Logic (_executeWithFallback)', () => {
      beforeEach(async () => {
          config.dataSource = 'gcp'; // GCP Primary
          await api.initialize(mockSupabase);
      });

      it('should intercept primary service error and route to secondary service', async () => {
          const mockPrimary = { testMethod: vi.fn().mockRejectedValue(new Error('Primary Error')) };
          const mockSecondary = { testMethod: vi.fn().mockResolvedValue('Secondary Success') };

          api.primaryService = mockPrimary;
          api.secondaryService = mockSecondary;

          const result = await api._executeWithFallback('testMethod', 'arg1', 'arg2');

          expect(mockPrimary.testMethod).toHaveBeenCalledWith('arg1', 'arg2');
          expect(mockSecondary.testMethod).toHaveBeenCalledWith('arg1', 'arg2');
          expect(result).toBe('Secondary Success');
      });

      it('should return primary service result if successful', async () => {
          const mockPrimary = { testMethod: vi.fn().mockResolvedValue('Primary Success') };
          const mockSecondary = { testMethod: vi.fn() };

          api.primaryService = mockPrimary;
          api.secondaryService = mockSecondary;

          const result = await api._executeWithFallback('testMethod', 'arg1', 'arg2');

          expect(mockPrimary.testMethod).toHaveBeenCalledWith('arg1', 'arg2');
          expect(mockSecondary.testMethod).not.toHaveBeenCalled();
          expect(result).toBe('Primary Success');
      });

      it('should fall back to secondary service if primary fails', async () => {
          gcpApiService.queryDatabase.mockRejectedValueOnce(new Error('GCP Failed'));
          supabaseApiService.queryDatabase.mockResolvedValueOnce(['backup_result']);

          const result = await api.queryDatabase('q', 'u1');
          expect(result).toEqual(['backup_result']);
          expect(gcpApiService.queryDatabase).toHaveBeenCalled();
          expect(supabaseApiService.queryDatabase).toHaveBeenCalled();
      });

      it('should throw if both services fail', async () => {
          const mockPrimary = { testMethod: vi.fn().mockRejectedValue(new Error('Primary Error')) };
          const mockSecondary = { testMethod: vi.fn().mockRejectedValue(new Error('Secondary Error')) };

          api.primaryService = mockPrimary;
          api.secondaryService = mockSecondary;

          await expect(api._executeWithFallback('testMethod', 'arg1')).rejects.toThrow('Secondary Error');
      });

      it('should properly delegate searchChatHistory with fallback', async () => {
          gcpApiService.searchChatHistory.mockRejectedValueOnce(new Error('GCP Search Failed'));
          supabaseApiService.searchChatHistory = vi.fn().mockResolvedValueOnce(['search_result']);

          const result = await api.searchChatHistory('query', 'user-1');
          expect(result).toEqual(['search_result']);
          expect(gcpApiService.searchChatHistory).toHaveBeenCalledWith('query', 'user-1');
          expect(supabaseApiService.searchChatHistory).toHaveBeenCalledWith('query', 'user-1');
      });

      it('should fall back to secondary service if primary service is null', async () => {
          api.primaryService = null;
          supabaseApiService.queryDatabase.mockResolvedValueOnce(['secondary_result']);

          const result = await api.queryDatabase('q', 'u1');
          expect(result).toEqual(['secondary_result']);
          expect(gcpApiService.queryDatabase).not.toHaveBeenCalled();
          expect(supabaseApiService.queryDatabase).toHaveBeenCalled();
      });

      it('should throw an error if no API service is available', async () => {
          api.primaryService = null;
          api.secondaryService = null;

          await expect(api.queryDatabase('q', 'u1')).rejects.toThrow('No API service available.');
      });
  });

  describe('Custom Fallback Logic (sendEmail)', () => {
      beforeEach(async () => {
          config.dataSource = 'gcp'; // The custom fallback ignores dataSource and always tries Supabase first
          await api.initialize(mockSupabase);

          if (typeof supabaseApiService.sendEmail !== 'function') {
            supabaseApiService.sendEmail = vi.fn();
          }
          if (typeof gcpApiService.sendEmail !== 'function') {
            gcpApiService.sendEmail = vi.fn();
          }
      });

      it('should use Supabase (primary) for sendEmail if successful', async () => {
          supabaseApiService.sendEmail.mockResolvedValueOnce({ success: true });
          const result = await api.sendEmail('to@test.com', 'Subj', 'Body', 'u1');
          expect(result).toEqual({ success: true });
          expect(supabaseApiService.sendEmail).toHaveBeenCalledWith('to@test.com', 'Subj', 'Body', 'u1');
          expect(gcpApiService.sendEmail).not.toHaveBeenCalled();
      });

      it('should fall back to GCP for sendEmail if Supabase fails', async () => {
          supabaseApiService.sendEmail.mockRejectedValueOnce(new Error('Supabase email fail'));
          gcpApiService.sendEmail.mockResolvedValueOnce({ backup_success: true });

          const result = await api.sendEmail('to@test.com', 'Subj', 'Body', 'u1');
          expect(result).toEqual({ backup_success: true });
          expect(supabaseApiService.sendEmail).toHaveBeenCalled();
          expect(gcpApiService.sendEmail).toHaveBeenCalled();
      });

      it('should throw error if both Supabase and GCP fail for sendEmail', async () => {
          supabaseApiService.sendEmail.mockRejectedValueOnce(new Error('Supabase email fail'));
          gcpApiService.sendEmail.mockRejectedValueOnce(new Error('GCP email fail'));

          await expect(api.sendEmail('to@test.com', 'Subj', 'Body', 'u1')).rejects.toThrow('GCP email fail');
      });
  });

  describe('Dual Write Logic (_executeDualWrite)', () => {
      beforeEach(async () => {
          config.dataSource = 'gcp';
          await api.initialize(mockSupabase);
      });

      it('should write to both services and return primary result on success', async () => {
          gcpApiService.addContact.mockResolvedValueOnce({ id: '1' });
          supabaseApiService.addContact.mockResolvedValueOnce({ id: '1' });

          const result = await api.addContact('N', 'E', 'S', 'U');

          expect(gcpApiService.addContact).toHaveBeenCalled();
          expect(supabaseApiService.addContact).toHaveBeenCalled();
          expect(result).toEqual({ id: '1' });
      });

      it('should return secondary result if primary fails but secondary succeeds', async () => {
          gcpApiService.addContact.mockRejectedValueOnce(new Error('Primary Fail'));
          supabaseApiService.addContact.mockResolvedValueOnce({ id: 'backup' });

          const result = await api.addContact('N', 'E', 'S', 'U');
          expect(result).toEqual({ id: 'backup' });
      });

      it('should throw if both writes fail', async () => {
          gcpApiService.addContact.mockRejectedValueOnce(new Error('Primary Fail'));
          supabaseApiService.addContact.mockRejectedValueOnce(new Error('Secondary Fail'));

          await expect(api.addContact('N', 'E', 'S', 'U')).rejects.toThrow('Primary Fail');
      });
  });

  describe('Method Delegation', () => {
    // Parameterized test to check delegation for multiple methods
    const methodsToTest = [
      { name: 'queryDatabase', args: ['test query', 'user-1'] },
      { name: 'listAllContacts', args: [{}, 'user-1'] },
      { name: 'getContacts', args: ['searchTerm', 'user-1'] },
      { name: 'getContactsBySource', args: [] },
      { name: 'getEventsByType', args: [] },
      { name: 'getSystemStats', args: ['user-1'] },
      { name: 'getProjectManagementStats', args: ['user-1'] },
      { name: 'getAPIStats', args: [] },
      { name: 'logWorkflowExecution', args: ['workflowName', { data: 'val' }] },
      { name: 'listAPIIntegrations', args: [] },
      { name: 'getIntegrationsWithStats', args: [] },
      { name: 'testAPIIntegration', args: ['integrationName'] },
      { name: 'getWorkflows', args: [] },
      { name: 'deleteIntegration', args: ['id'] },
      { name: 'getChatHistoryForUser', args: ['user-1', 'conv-1'] },
      { name: 'searchChatHistory', args: ['query', 'user-1'] },
      { name: 'searchMemory', args: [[0.1, 0.2], 5, 'user-1'] },
      { name: 'getUsers', args: [] },
      { name: 'updateUserRole', args: ['user-1', 'admin'] },
      { name: 'deleteUser', args: ['user-to-delete-id'] },
      { name: 'inviteUser', args: ['email@test.com'] },
      { name: 'getAvailableProviderNames', args: [] },
      { name: 'getRecentWorkflows', args: [] },
      { name: 'getWorkflowExecutions', args: [] },
      { name: 'recalculateMetrics', args: [] },
      { name: 'createProject', args: ['name', 'description', 'user-1'] },
      { name: 'listProjects', args: ['user-1'] },
      { name: 'getProjectByName', args: ['name'] },
      { name: 'listTasksForProject', args: ['project-id'] },
      { name: 'createTasks', args: [[{}], 'user-1'] },
      { name: 'getTaskByTitle', args: ['title', 'project-id'] },
      { name: 'updateTaskStatus', args: ['task-id', 'status'] },
      { name: 'getContactByEmail', args: ['email@test.com'] },
      { name: 'createNote', args: ['contact-id', 'content', 'user-1'] },
      { name: 'getNotesForContact', args: ['contact-id'] },
      { name: 'deleteNote', args: ['note-id'] },
      { name: 'getUserProfile', args: ['user-1'] },
      { name: 'getUserSettings', args: ['user-1'] },
      { name: 'saveUserSettings', args: ['user-1', {}] },
      { name: 'updateUserProfile', args: ['user-1', {}] },
      { name: 'listDevices', args: ['user-1'] },
      { name: 'getDashboardMetrics', args: [] },
      { name: 'createTaskForProject', args: ['title', 'project-name', 'user-1', 'description'] },
      { name: 'assignTaskToContact', args: ['task-title', 'contact-email'] },
      { name: 'bulkDeleteContacts', args: [['email1', 'email2']] },
      { name: 'initiateTranscription', args: ['source_url', 'user-1'] },
      { name: 'assignCanvasserToTurf', args: ['contact-email', 'turf-name', 'user-1'] },
      { name: 'invokeAximService', args: ['service-name', 'endpoint', { payload: 'data' }, 'user-1'] },
      { name: 'getScheduledTasks', args: ['user-1'] },
      { name: 'createScheduledTask', args: ['cmd', 'schedule', 'user-1'] },
      { name: 'deleteScheduledTask', args: ['task-id'] },
      { name: 'triggerDataExport', args: [] },
      { name: 'fetchUrl', args: ['http://url'] },
      { name: 'triggerContentEngine', args: [{}] },
      { name: 'checkSystemHealth', args: [] },
    ];

    methodsToTest.forEach(({ name, args }) => {
      it(`should delegate ${name} call to the primary service`, async () => {
        config.dataSource = 'supabase'; // Supabase is primary
        await api.initialize(mockSupabase);

        // Ensure the mocked method exists on the service
        if (typeof supabaseApiService[name] !== 'function') {
          supabaseApiService[name] = vi.fn();
        }

        await api[name](...args);
        expect(supabaseApiService[name]).toHaveBeenCalledWith(...args);
      });

      it(`should fall back to the secondary service for ${name} if primary fails`, async () => {
        config.dataSource = 'supabase'; // Supabase is primary
        await api.initialize(mockSupabase);

        if (typeof supabaseApiService[name] !== 'function') {
          supabaseApiService[name] = vi.fn();
        }
        if (typeof gcpApiService[name] !== 'function') {
          gcpApiService[name] = vi.fn();
        }

        const expectedResult = `fallback_result_for_${name}`;
        supabaseApiService[name].mockRejectedValueOnce(new Error('Primary Service Failed'));
        gcpApiService[name].mockResolvedValueOnce(expectedResult);

        const result = await api[name](...args);

        expect(supabaseApiService[name]).toHaveBeenCalledWith(...args);
        expect(gcpApiService[name]).toHaveBeenCalledWith(...args);
        expect(result).toBe(expectedResult);
      });
    });

    it('should delegate addContact to primary service with generated ID', async () => {
      config.dataSource = 'supabase';
      await api.initialize(mockSupabase);

      const args = ['name', 'email', 'source', 'user-1'];
      await api.addContact(...args);

      // Expect the 5th argument to be a UUID string
      expect(supabaseApiService.addContact).toHaveBeenCalledWith(...args, expect.any(String));
    });

    it('should explicitly delegate invokeAximService to GCP service when GCP is primary', async () => {
      config.dataSource = 'gcp';
      await api.initialize(mockSupabase);

      const args = ['service-name', 'endpoint', { payload: 'data' }, 'user-1'];
      await api.invokeAximService(...args);

      expect(gcpApiService.invokeAximService).toHaveBeenCalledWith(...args);
    });

    const dualWriteMethodsToTest = [
      { name: 'bulkAddContacts', args: [[{ name: 'n1', email: 'e1' }, { name: 'n2', email: 'e2' }], 'user-1'] },
      { name: 'deleteContact', args: ['email@test.com', 'user-1'] },
      { name: 'deleteContactById', args: ['contact-id', 'user-1'] },
      { name: 'updateContact', args: ['email@test.com', {}, 'user-1'] },
      { name: 'updateContactById', args: ['contact-id', {}, 'user-1'] },
      { name: 'registerDevice', args: ['dev-1', 'dev-name', {}, 'user-1'] },
      { name: 'sendDeviceHeartbeat', args: ['dev-1', {}] },
      { name: 'updateDevice', args: ['dev-1', {}, 'user-1'] },
      { name: 'deleteDevice', args: ['dev-1', 'user-1'] },
      { name: 'logEvent', args: ['type', {}, 'user-1'] },
    ];

    dualWriteMethodsToTest.forEach(({ name, args }) => {
      it(`should delegate ${name} call to both primary and secondary services for dual write`, async () => {
        config.dataSource = 'supabase'; // Supabase is primary
        await api.initialize(mockSupabase);

        if (typeof supabaseApiService[name] !== 'function') {
          supabaseApiService[name] = vi.fn().mockResolvedValue({});
        }
        if (typeof gcpApiService[name] !== 'function') {
          gcpApiService[name] = vi.fn().mockResolvedValue({});
        }

        await api[name](...args);

        expect(supabaseApiService[name]).toHaveBeenCalled();
        expect(gcpApiService[name]).toHaveBeenCalled();
      });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('AI Interaction Logging Resilience', () => {
      beforeEach(async () => {
          config.dataSource = 'gcp';
          await api.initialize(mockSupabase);
      });

      it('should attempt secondary log if primary fails', async () => {
          gcpApiService.logAIInteraction.mockRejectedValueOnce(new Error('GCP Log Fail'));
          supabaseApiService.logAIInteraction.mockResolvedValueOnce({});

          await api.logAIInteraction('cmd', 'res', 100, 'success', 'u', 'c', 'type', 'prov', 'model');

          expect(gcpApiService.logAIInteraction).toHaveBeenCalled();
          expect(supabaseApiService.logAIInteraction).toHaveBeenCalled();
      });

      it('should log to secondary service if primary is successful and secondary is different (dual-write)', async () => {
          gcpApiService.logAIInteraction.mockResolvedValueOnce({});
          supabaseApiService.logAIInteraction.mockResolvedValueOnce({});

          await api.logAIInteraction('cmd', 'res', 100, 'success', 'u', 'c', 'type', 'prov', 'model');

          expect(gcpApiService.logAIInteraction).toHaveBeenCalled();
          expect(supabaseApiService.logAIInteraction).toHaveBeenCalled();
      });

      it('should throw error only if BOTH logs fail', async () => {
          gcpApiService.logAIInteraction.mockRejectedValueOnce(new Error('GCP Log Fail'));
          supabaseApiService.logAIInteraction.mockRejectedValueOnce(new Error('Supabase Log Fail'));

          await expect(api.logAIInteraction('cmd', 'res', 100, 'success', 'u', 'c', 'type', 'prov', 'model'))
            .rejects.toThrow('Supabase Log Fail');
      });

      it('should throw an error if primary fails and there is no secondary service', async () => {
          api.secondaryService = null;
          gcpApiService.logAIInteraction.mockRejectedValueOnce(new Error('GCP Log Fail'));

          await expect(api.logAIInteraction('cmd', 'res', 100, 'success', 'u', 'c', 'type', 'prov', 'model'))
            .rejects.toThrow('All services failed to log AI interaction.');
      });
  });
});
