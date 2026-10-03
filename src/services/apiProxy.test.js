import { describe, it, expect, vi, beforeEach } from 'vitest';
import { callApiProxy } from './apiProxy';
import { supabase } from './supabaseClient';

vi.mock('./supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'test_token' } } })
    },
    functions: {
      invoke: vi.fn()
    },
    from: vi.fn(() => ({
        insert: vi.fn().mockResolvedValue({}),
        upsert: vi.fn().mockReturnValue({ setHeader: vi.fn().mockResolvedValue({}) })
    }))
  },
}));

vi.mock('./logging', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }
}));


describe('API Proxy Edge Guardrails', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        global.fetch = vi.fn();
        supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'test_token' } } });
        supabase.functions.invoke.mockResolvedValue({ data: { success: true }, error: null });
        import.meta.env.VITE_CLOUDFLARE_WORKER_URL = 'http://cloudflare.mock';
    });

    it('should route through Cloudflare primary first', async () => {
        global.fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ success: true })
        });

        await callApiProxy({ integrationId: 'test', endpoint: '/test', method: 'GET' });

        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect(global.fetch.mock.calls[0][0]).toBe('http://cloudflare.mock/api-proxy');
        expect(supabase.functions.invoke).not.toHaveBeenCalledWith('api-proxy', expect.any(Object));
    });

    it('should fallback to Supabase if Cloudflare fails', async () => {
        global.fetch.mockResolvedValueOnce({
            ok: false,
            status: 502
        });

        await callApiProxy({ integrationId: 'test', endpoint: '/test', method: 'GET' });

        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect(supabase.functions.invoke).toHaveBeenCalledTimes(1);
        expect(supabase.functions.invoke).toHaveBeenCalledWith('api-proxy', expect.any(Object));
    });
});
