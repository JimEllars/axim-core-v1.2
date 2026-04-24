import { vi, describe, it, expect, beforeEach } from 'vitest';
import integrationCommands from '../integrationCommands';

describe('Integration Commands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    Object.assign(import.meta.env, {
      VITE_SUPABASE_URL: 'http://localhost:8000',
      VITE_SUPABASE_SERVICE_ROLE_KEY: 'test-service-key'
    });
  });

  describe('verifyRoundupsConnection', () => {
    const command = integrationCommands.find(c => c.name === 'verifyRoundupsConnection');

    it('should exist', () => {
      expect(command).toBeDefined();
    });

    it('should return success message when connected', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'connected', service: 'roundups' })
      });

      const result = await command.execute({}, {});
      expect(result).toBe("The Roundups API pipeline is secure and the API key is active.");

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8000/functions/v1/roundups-connector',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-service-key'
          },
          body: JSON.stringify({ action: 'test_connection' })
        })
      );
    });

    it('should return failure message when connection fails', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'failed', error: 'ROUNDUPS_API_KEY not found' })
      });

      const result = await command.execute({}, {});
      expect(result).toBe('Connection test failed: {"status":"failed","error":"ROUNDUPS_API_KEY not found"}');
    });
  });
});
