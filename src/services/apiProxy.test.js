import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('callApiProxy', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('should call the proxy successfully and return data', async () => {
    const mockInvoke = vi.fn().mockResolvedValue({
      data: { success: true },
      error: null,
    });

    vi.doMock('./supabaseClient', () => ({
      supabase: {
        functions: {
          invoke: mockInvoke,
        },
      },
    }));

    const { callApiProxy } = await import('./apiProxy');

    const params = {
      integrationId: 'int-123',
      endpoint: '/users',
      method: 'POST',
      body: { name: 'test' },
      headers: { Authorization: 'Bearer test' },
    };

    const result = await callApiProxy(params);

    expect(mockInvoke).toHaveBeenCalledWith('api-proxy', {
      body: params,
    });
    expect(result).toEqual({ success: true });
  });

  it('should throw an error if supabase client is not initialized', async () => {
    vi.doMock('./supabaseClient', () => ({
      supabase: null,
    }));

    const { callApiProxy } = await import('./apiProxy');

    await expect(callApiProxy({ integrationId: '1' })).rejects.toThrow("Supabase client is not initialized.");
  });

  it('should throw an API Proxy Error if supabase.functions.invoke returns an error', async () => {
    const mockInvoke = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'Network timeout' },
    });

    vi.doMock('./supabaseClient', () => ({
      supabase: {
        functions: {
          invoke: mockInvoke,
        },
      },
    }));

    const { callApiProxy } = await import('./apiProxy');

    await expect(callApiProxy({ integrationId: '1' })).rejects.toThrow("API Proxy Error: Network timeout");
  });

  it('should throw an API Error if the returned data contains an error property', async () => {
    const mockInvoke = vi.fn().mockResolvedValue({
      data: { error: 'Invalid integration token' },
      error: null,
    });

    vi.doMock('./supabaseClient', () => ({
      supabase: {
        functions: {
          invoke: mockInvoke,
        },
      },
    }));

    const { callApiProxy } = await import('./apiProxy');

    await expect(callApiProxy({ integrationId: '1' })).rejects.toThrow("API Error: Invalid integration token");
  });
});
