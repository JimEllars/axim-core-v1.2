import { describe, it, expect, vi, beforeEach } from 'vitest';
import api from '../api';

vi.mock('../../supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
    },
  },
}));

describe('ApiService Facade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Onyx Edge Worker requests', () => {
    it('uses the authenticated Supabase access token rather than a browser environment secret', async () => {
      api.supabase = {
        auth: {
          getSession: vi.fn().mockResolvedValue({
            data: { session: { access_token: 'user-access-token' } },
          }),
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'success' }),
      });

      await api.sendToOnyxWorker({ command: 'status' });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://onyx-bridge.axim.us.com/api/v1/chat',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer user-access-token',
          }),
        })
      );
    });
  });
});
