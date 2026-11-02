import { vi, describe, it, expect, beforeEach } from 'vitest';
import integrationCommands from '../integrationCommands';

// The command no longer authenticates with a service credential baked into the
// bundle: it presents the operator's own session token. Mock the helper so the
// test pins the header the command actually sends.
vi.mock('../../../../services/sessionAuth', () => ({
  sessionAuthHeaders: vi.fn(async (extra = {}) => ({
    ...extra,
    Authorization: 'Bearer test-session-token',
  })),
}));

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
            Authorization: 'Bearer test-session-token'
          },
          body: JSON.stringify({ action: 'test_connection' })
        })
      );
    });

    it('should never send a service-role credential from the browser', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'connected', service: 'roundups' })
      });

      await command.execute({}, {});

      const [, request] = global.fetch.mock.calls[0];
      expect(request.headers.Authorization).not.toContain('test-service-key');
      expect(request.headers).not.toHaveProperty('X-Axim-Internal-Service-Key');
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
