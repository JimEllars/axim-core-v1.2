import { describe, it, expect, vi, beforeEach } from 'vitest';
import { callApiProxy } from '../apiProxy';
import { supabase } from '../supabaseClient';

vi.mock('../supabaseClient', () => {
  return {
    supabase: {
      functions: {
        invoke: vi.fn(),
      },
    },
  };
});

describe('callApiProxy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call supabase.functions.invoke with correct parameters and return data on success', async () => {
    const mockResponse = { data: { success: true }, error: null };
    supabase.functions.invoke.mockResolvedValueOnce(mockResponse);

    const params = {
      integrationId: 'int-123',
      endpoint: '/users',
      method: 'GET',
      body: { name: 'test' },
      headers: { 'Authorization': 'Bearer token' },
    };

    const result = await callApiProxy(params);

    expect(supabase.functions.invoke).toHaveBeenCalledWith('api-proxy', {
      body: {
        integrationId: 'int-123',
        endpoint: '/users',
        method: 'GET',
        body: { name: 'test' },
        headers: { 'Authorization': 'Bearer token' },
      },
    });
    expect(result).toEqual({ success: true });
  });

  it('should throw an error if supabase.functions.invoke returns an error object', async () => {
    const mockResponse = { data: null, error: { message: 'Network error' } };
    supabase.functions.invoke.mockResolvedValueOnce(mockResponse);

    const params = {
      integrationId: 'int-123',
      endpoint: '/users',
      method: 'GET',
    };

    await expect(callApiProxy(params)).rejects.toThrow('API Proxy Error: Network error');
  });

  it('should throw an error if the returned data contains an error property', async () => {
    const mockResponse = { data: { error: 'Invalid API Key' }, error: null };
    supabase.functions.invoke.mockResolvedValueOnce(mockResponse);

    const params = {
      integrationId: 'int-123',
      endpoint: '/users',
      method: 'GET',
    };

    await expect(callApiProxy(params)).rejects.toThrow('API Error: Invalid API Key');
  });

  it('should throw an error if supabase client is not initialized', async () => {
    vi.resetModules();
    vi.doMock('../supabaseClient', () => {
      return { supabase: null };
    });

    const { callApiProxy: dynamicCallApiProxy } = await import('../apiProxy');

    await expect(dynamicCallApiProxy({
      integrationId: '123', endpoint: '/test', method: 'GET'
    })).rejects.toThrow('Supabase client is not initialized.');
  });

  it('should call supabase.functions.invoke correctly without optional parameters (body, headers)', async () => {
    const mockResponse = { data: { success: true }, error: null };
    supabase.functions.invoke.mockResolvedValueOnce(mockResponse);

    const params = {
      integrationId: 'int-456',
      endpoint: '/health',
      method: 'GET',
    };

    const result = await callApiProxy(params);

    expect(supabase.functions.invoke).toHaveBeenCalledWith('api-proxy', {
      body: {
        integrationId: 'int-456',
        endpoint: '/health',
        method: 'GET',
        body: undefined,
        headers: undefined,
      },
    });
    expect(result).toEqual({ success: true });
  });
});
