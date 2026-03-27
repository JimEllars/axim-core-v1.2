import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';

// Mock axios.create before importing the module
vi.mock('axios', () => {
  const mockAxiosInstance = {
    post: vi.fn(),
    interceptors: {
      request: {
        use: vi.fn(),
      },
    },
    defaults: {
      baseURL: '',
      headers: {},
    },
  };
  return {
    default: {
      create: vi.fn(() => mockAxiosInstance),
    },
  };
});

describe('apiClient', () => {
  let callCloudApi;
  let apiClient;
  let mockAxiosInstance;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    // Mock localStorage
    const localStorageMock = (() => {
      let store = {};
      return {
        getItem: vi.fn((key) => store[key] || null),
        setItem: vi.fn((key, value) => {
          store[key] = value.toString();
        }),
        clear: vi.fn(() => {
          store = {};
        }),
      };
    })();
    Object.defineProperty(window, 'localStorage', { value: localStorageMock });

    // Important: Get the mocked instance that axios.create returned
    mockAxiosInstance = axios.create();

    // Re-import the module to ensure fresh mock evaluation and variable binding
    const module = await import('../apiClient.js');
    apiClient = module.default;
    callCloudApi = module.callCloudApi;
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  describe('configuration', () => {
    it('should create an axios instance with the correct baseURL and headers', () => {
      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: expect.any(String), // Either from env or default
          headers: {
            'Content-Type': 'application/json',
          },
        })
      );
    });
  });

  describe('request interceptor', () => {
    it('should add the Authorization header if a token exists in localStorage', () => {
      window.localStorage.setItem('supabase.auth.token', 'test-token');

      // Extract the interceptor callback function registered during module load
      const interceptorCallback = mockAxiosInstance.interceptors.request.use.mock.calls[0][0];

      const config = { headers: {} };
      const newConfig = interceptorCallback(config);

      expect(newConfig.headers.Authorization).toBe('Bearer test-token');
      expect(window.localStorage.getItem).toHaveBeenCalledWith('supabase.auth.token');
    });

    it('should not add the Authorization header if no token exists in localStorage', () => {
      // Extract the interceptor callback function registered during module load
      const interceptorCallback = mockAxiosInstance.interceptors.request.use.mock.calls[0][0];

      const config = { headers: {} };
      const newConfig = interceptorCallback(config);

      expect(newConfig.headers.Authorization).toBeUndefined();
    });
  });

  describe('callCloudApi', () => {
    it('should make a POST request to the correct endpoint with the given payload', async () => {
      const mockResponse = { data: { success: true, result: 'data' } };
      mockAxiosInstance.post.mockResolvedValueOnce(mockResponse);

      const endpoint = 'test/endpoint';
      const payload = { key: 'value' };

      const result = await callCloudApi(endpoint, payload);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(`/${endpoint}`, payload);
      expect(result).toEqual(mockResponse.data);
    });

    it('should throw a structured error if the request fails', async () => {
      const mockError = {
        response: {
          data: {
            error: 'Custom API Error',
          },
        },
      };
      mockAxiosInstance.post.mockRejectedValueOnce(mockError);

      const endpoint = 'test/endpoint';
      const payload = { key: 'value' };

      // Spy on console.error to prevent it from cluttering test output
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(callCloudApi(endpoint, payload)).rejects.toEqual({
        success: false,
        error: 'Custom API Error',
        source: `apiClient:${endpoint}`,
      });

      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    it('should throw a structured default error if the request fails without response data', async () => {
      const mockError = new Error('Network Error');
      mockAxiosInstance.post.mockRejectedValueOnce(mockError);

      const endpoint = 'test/endpoint';
      const payload = { key: 'value' };

      // Spy on console.error to prevent it from cluttering test output
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(callCloudApi(endpoint, payload)).rejects.toEqual({
        success: false,
        error: 'A network error occurred.',
        source: `apiClient:${endpoint}`,
      });

      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });
});
