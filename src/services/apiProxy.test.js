import { describe, it, expect, vi, beforeEach } from 'vitest';
import { callApiProxy, submitMicroAppTelemetry } from './apiProxy';
import { supabase } from './supabaseClient';
import logger from './logging';

vi.mock('./supabaseClient', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
    from: vi.fn(() => ({
      insert: vi.fn()
    }))
  },
}));

vi.mock('./logging', () => ({
  default: {
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe('apiProxy.js tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('submitMicroAppTelemetry', () => {
    it('should validate payloads and insert them into api_usage_logs directly', async () => {
      const mockInsert = vi.fn().mockResolvedValue({ data: { success: true }, error: null });
      supabase.from.mockReturnValue({ insert: mockInsert });

      const payload = {
        app_id: 'test_app',
        endpoint: '/test/endpoint',
        method: 'POST',
        status_code: 200,
        execution_time_ms: 150
      };

      const result = await submitMicroAppTelemetry(payload);

      expect(supabase.from).toHaveBeenCalledWith('api_usage_logs');
      expect(mockInsert).toHaveBeenCalledWith([expect.objectContaining(payload)]);
      expect(result).toEqual({ success: true });
    });

    it('should handle payload arrays', async () => {
      const mockInsert = vi.fn().mockResolvedValue({ data: { success: true }, error: null });
      supabase.from.mockReturnValue({ insert: mockInsert });

      const payload = [{
        app_id: 'test_app',
        endpoint: '/test/endpoint',
      }];

      await submitMicroAppTelemetry(payload);

      expect(mockInsert).toHaveBeenCalledWith([expect.objectContaining({
        app_id: 'test_app',
        endpoint: '/test/endpoint',
        method: 'UNKNOWN',
        status_code: 200,
        execution_time_ms: 0
      })]);
    });

    it('should return undefined and log error on invalid payload format', async () => {
      const result = await submitMicroAppTelemetry(null);

      expect(logger.error).toHaveBeenCalledWith('Invalid payload format for telemetry');
      expect(result).toBeUndefined();
    });

    it('should not throw on insert failure, but log it', async () => {
      const mockInsert = vi.fn().mockResolvedValue({ data: null, error: new Error("Insert Failed") });
      supabase.from.mockReturnValue({ insert: mockInsert });

      const result = await submitMicroAppTelemetry({ app_id: 'test' });

      expect(logger.error).toHaveBeenCalledWith('Failed to submit micro-app telemetry: Insert Failed');
      expect(result).toBeUndefined();
    });
  });

  describe('callApiProxy', () => {
    it('should call api-proxy edge function and return data', async () => {
      supabase.functions.invoke.mockResolvedValue({ data: { success: true }, error: null });

      const result = await callApiProxy({ integrationId: 'test' });
      expect(result).toEqual({ success: true });
      expect(supabase.functions.invoke).toHaveBeenCalledWith('api-proxy', {
        body: { integrationId: 'test', endpoint: undefined, method: undefined, body: undefined, headers: undefined }
      });
    });

    it('should throw an error if invoke fails', async () => {
      supabase.functions.invoke.mockResolvedValue({ data: null, error: new Error('Network error') });

      await expect(callApiProxy({ integrationId: 'test' })).rejects.toThrow('API Proxy Error: Network error');
    });

    it('should throw an error if data contains error', async () => {
      supabase.functions.invoke.mockResolvedValue({ data: { error: 'API Error' }, error: null });

      await expect(callApiProxy({ integrationId: 'test' })).rejects.toThrow('API Proxy Error: API Error: API Error');
    });
  });
});
