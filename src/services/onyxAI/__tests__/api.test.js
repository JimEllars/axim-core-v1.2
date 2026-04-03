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

      it('should return primary service result if successful', async () => {
          gcpApiService.queryDatabase.mockResolvedValueOnce(['result']);
          const result = await api.queryDatabase('q', 'u1');
          expect(result).toEqual(['result']);
          expect(supabaseApiService.queryDatabase).not.toHaveBeenCalled();
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
          gcpApiService.queryDatabase.mockRejectedValueOnce(new Error('GCP Failed'));
          supabaseApiService.queryDatabase.mockRejectedValueOnce(new Error('Supabase Failed'));

          await expect(api.queryDatabase('q', 'u1')).rejects.toThrow('Supabase Failed');
          // Note: The implementation throws the *secondary* error if both fail.
      });

      it('should properly delegate searchChatHistory with fallback', async () => {
          gcpApiService.searchChatHistory.mockRejectedValueOnce(new Error('GCP Search Failed'));
          supabaseApiService.searchChatHistory = vi.fn().mockResolvedValueOnce(['search_result']);

          const result = await api.searchChatHistory('query', 'user-1');
          expect(result).toEqual(['search_result']);
          expect(gcpApiService.searchChatHistory).toHaveBeenCalledWith('query', 'user-1');
          expect(supabaseApiService.searchChatHistory).toHaveBeenCalledWith('query', 'user-1');
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
      // addContact removed because it generates an ID and uses dual write
      { name: 'listAllContacts', args: [{}, 'user-1'] },
      { name: 'getSystemStats', args: ['user-1'] },
      { name: 'logAIInteraction', args: ['cmd', 'resp', 100, 'success', 'user-1', 'conv-1', 'direct', 'gemini', 'pro', null] },
      { name: 'initiateTranscription', args: ['source_url', 'user-1'] },
      { name: 'deleteUser', args: ['user-to-delete-id'] },
      { name: 'invokeAximService', args: ['service-name', 'endpoint', { payload: 'data' }, 'user-1'] },
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

      it('should throw error only if BOTH logs fail', async () => {
          gcpApiService.logAIInteraction.mockRejectedValueOnce(new Error('GCP Log Fail'));
          supabaseApiService.logAIInteraction.mockRejectedValueOnce(new Error('Supabase Log Fail'));

          await expect(api.logAIInteraction('cmd', 'res', 100, 'success', 'u', 'c', 'type', 'prov', 'model'))
            .rejects.toThrow('Supabase Log Fail');
      });
  });
});
