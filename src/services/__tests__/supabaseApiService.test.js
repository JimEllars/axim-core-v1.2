import { describe, it, expect, vi, beforeEach } from 'vitest';
import supabaseApiService from '../supabaseApiService';

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn()
  }
}));

describe('SupabaseApiService', () => {
  let mockSupabase;
  let mockConnectivityManager;
  let mockOfflineManager;

  beforeEach(() => {
    mockSupabase = {
      rpc: vi.fn(),
      from: vi.fn(() => mockSupabase),
      insert: vi.fn(() => mockSupabase),
      select: vi.fn(() => mockSupabase),
      eq: vi.fn(() => mockSupabase),
      update: vi.fn(() => mockSupabase),
      single: vi.fn(() => Promise.resolve({ data: { id: 1 }, error: null })),
      functions: {
        invoke: vi.fn().mockResolvedValue({ data: { embedding: [0.1, 0.2] }, error: null })
      }
    };

    mockConnectivityManager = {
      getIsOnline: vi.fn().mockReturnValue(true)
    };

    mockOfflineManager = {
      queueRequest: vi.fn()
    };

    supabaseApiService.initialize(mockSupabase, mockConnectivityManager, mockOfflineManager);
  });

  describe('searchMemory', () => {
    it('should invoke match_ai_memory_banks and match_ai_interactions and combine results', async () => {
      mockSupabase.rpc.mockImplementation((rpcName) => {
        if (rpcName === 'match_ai_memory_banks') {
          return Promise.resolve({
            data: [
              { content: 'bank summary 1', executive_summary: 'exec summary 1' }
            ],
            error: null
          });
        }
        if (rpcName === 'match_ai_interactions') {
          return Promise.resolve({
            data: [
              { command: 'cmd1', response: 'res1', compressed: true },
              { command: 'cmd2', response: 'res2', is_compressed: false }
            ],
            error: null
          });
        }
      });

      const results = await supabaseApiService.searchMemory([0.1, 0.2], 5, 'user-123');

      expect(mockSupabase.rpc).toHaveBeenCalledWith('match_ai_memory_banks', expect.any(Object));
      expect(mockSupabase.rpc).toHaveBeenCalledWith('match_ai_interactions', expect.any(Object));

      expect(results).toHaveLength(3);
      expect(results[0].command).toBe('Memory Bank Summary');
      expect(results[0].response).toBe('bank summary 1');
      expect(results[1].command).toBe('cmd1');
      expect(results[1].is_compressed).toBe(true);
      expect(results[2].command).toBe('cmd2');
      expect(results[2].is_compressed).toBe(false);
    });

    it('should return gracefully if match_ai_interactions fails', async () => {
      mockSupabase.rpc.mockImplementation((rpcName) => {
        if (rpcName === 'match_ai_memory_banks') {
          return Promise.resolve({
            data: [
              { content: 'bank summary 1', executive_summary: 'exec summary 1' }
            ],
            error: null
          });
        }
        if (rpcName === 'match_ai_interactions') {
          return Promise.resolve({
            data: null,
            error: { message: 'RPC Error' }
          });
        }
      });

      const results = await supabaseApiService.searchMemory([0.1, 0.2], 5, 'user-123');

      expect(results).toHaveLength(0); // the current implementation returns [] on error
    });
  });

  describe('logAIInteraction', () => {
    it('should insert interaction and invoke generate-embedding asynchronously', async () => {
      await supabaseApiService.logAIInteraction('hello', 'world', 100, 'success', 'user-1', 'conv-1', 'chat', 'openai', 'gpt-4', null);

      expect(mockSupabase.from).toHaveBeenCalledWith('ai_interactions_ax2024');
      expect(mockSupabase.insert).toHaveBeenCalledWith(expect.objectContaining({
        command: 'hello',
        response: 'world',
        user_id: 'user-1'
      }));

      // Since generate-embedding is called as fire-and-forget, we can check if it was invoked
      // We might need a small delay in test to allow the async invoke to be registered if it's not awaited
      await new Promise(r => setTimeout(r, 10));

      expect(mockSupabase.functions.invoke).toHaveBeenCalledWith('generate-embedding', expect.objectContaining({
        body: { input: "hello world" }
      }));

      expect(mockSupabase.update).toHaveBeenCalledWith({ embedding: [0.1, 0.2] });
    });

    it('should drop log if offline', async () => {
      mockConnectivityManager.getIsOnline.mockReturnValue(false);
      await supabaseApiService.logAIInteraction('hello', 'world', 100, 'success', 'user-1', 'conv-1', 'chat', 'openai', 'gpt-4', null);

      expect(mockSupabase.from).not.toHaveBeenCalled();
    });
  });

  describe('Connectivity Checks', () => {
    it('should queue write operations when offline', async () => {
      mockConnectivityManager.getIsOnline.mockReturnValue(false);

      // Use addContact as an example write operation
      await supabaseApiService.addContact('Test', 'test@test.com', 'source', 'user-1');

      expect(mockOfflineManager.queueRequest).toHaveBeenCalledWith('addContact', expect.any(Array));
    });

    it('should block read operations when offline', async () => {
      mockConnectivityManager.getIsOnline.mockReturnValue(false);

      await expect(supabaseApiService.getDevices()).rejects.toThrow('The application is offline');
    });
  });
});
