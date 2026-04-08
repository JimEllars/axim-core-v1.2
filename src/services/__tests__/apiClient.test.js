import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock axios BEFORE importing apiClient
const mockPost = vi.fn();
const mockInterceptors = {
  request: { use: vi.fn(), eject: vi.fn() },
  response: { use: vi.fn(), eject: vi.fn() },
};

vi.mock('axios', () => {
  return {
    default: {
      create: vi.fn(() => ({
        post: mockPost,
        interceptors: mockInterceptors,
      })),
    },
  };
});

describe('apiClient', () => {
  let callCloudApi;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // Re-import to ensure mocks are applied
    const module = await import('../apiClient');
    callCloudApi = module.callCloudApi;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('callCloudApi', () => {
    const endpoint = 'test-endpoint';
    const payload = { data: 'test' };

    it('should return data on successful API call', async () => {
      const mockData = { success: true, result: 'ok' };
      mockPost.mockResolvedValueOnce({ data: mockData });

      const result = await callCloudApi(endpoint, payload);

      expect(mockPost).toHaveBeenCalledWith(`/${endpoint}`, payload);
      expect(result).toEqual(mockData);
    });

    it('should throw structured error and log to console when API returns a response error', async () => {
      const errorMsg = 'Invalid request';
      const errorResponse = {
        response: {
          data: {
            error: errorMsg,
          },
        },
      };
      mockPost.mockRejectedValueOnce(errorResponse);

      await expect(callCloudApi(endpoint, payload)).rejects.toEqual({
        success: false,
        error: errorMsg,
        source: `apiClient:${endpoint}`,
      });
      expect(console.error).toHaveBeenCalled();
    });

    it('should throw default error message when API returns no response data', async () => {
      const errorResponse = {
        response: {},
      };
      mockPost.mockRejectedValueOnce(errorResponse);

      await expect(callCloudApi(endpoint, payload)).rejects.toEqual({
        success: false,
        error: 'A network error occurred.',
        source: `apiClient:${endpoint}`,
      });
    });

    it('should throw default error message on generic network error', async () => {
      mockPost.mockRejectedValueOnce(new Error('Network Error'));

      await expect(callCloudApi(endpoint, payload)).rejects.toEqual({
        success: false,
        error: 'A network error occurred.',
        source: `apiClient:${endpoint}`,
      });
    });
  });
});
