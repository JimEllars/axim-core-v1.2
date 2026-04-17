import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { ApiProvider, useApi } from './ApiContext';
import apiClient from '../services/apiClient';

// Mock the apiClient
vi.mock('../services/apiClient', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  }
}));

describe('ApiContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Set default to cloud mode for basic tests
    vi.stubEnv('VITE_APP_MODE', 'cloud');

    // Setup global window.electronAPI
    window.electronAPI = {
      invoke: vi.fn()
    };
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should throw error when useApi is used outside ApiProvider', () => {
    // Suppress console.error for expected throw
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => {
      renderHook(() => useApi());
    }).toThrow('useApi must be used within an ApiProvider');
    consoleSpy.mockRestore();
  });

  it('should provide initial state correctly', () => {
    const wrapper = ({ children }) => <ApiProvider>{children}</ApiProvider>;
    const { result } = renderHook(() => useApi(), { wrapper });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBe(null);
    expect(typeof result.current.addContact).toBe('function');
  });

  describe('Cloud Mode', () => {
    beforeEach(() => {
      vi.stubEnv('VITE_APP_MODE', 'cloud');
    });

    it('should call apiClient on addContact in cloud mode', async () => {
      apiClient.post.mockResolvedValueOnce({ data: 'success' });

      const wrapper = ({ children }) => <ApiProvider>{children}</ApiProvider>;
      const { result } = renderHook(() => useApi(), { wrapper });

      let apiResult;
      await act(async () => {
        apiResult = await result.current.addContact('John Doe', 'john@test.com', 'test-source', 'user1');
      });

      expect(apiResult).toEqual({ data: 'success' });
      expect(apiClient.post).toHaveBeenCalledWith('/contacts', {
        name: 'John Doe',
        email: 'john@test.com',
        source: 'test-source',
        userId: 'user1'
      });
    });

    it('should handle API call failure and update error state', async () => {
      const error = new Error('Network error');
      apiClient.post.mockRejectedValueOnce(error);
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const wrapper = ({ children }) => <ApiProvider>{children}</ApiProvider>;
      const { result } = renderHook(() => useApi(), { wrapper });

      let apiResult;
      await act(async () => {
        apiResult = await result.current.addContact('John Doe', 'john@test.com', 'test-source', 'user1');
      });

      expect(apiResult).toBe(false);
      expect(result.current.error).toBe(error);
      expect(result.current.isLoading).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith('API call failed:', error);

      consoleSpy.mockRestore();
    });

    it('should clear previous errors on subsequent successful calls', async () => {
      // First call fails
      const error = new Error('First error');
      apiClient.post.mockRejectedValueOnce(error);
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const wrapper = ({ children }) => <ApiProvider>{children}</ApiProvider>;
      const { result } = renderHook(() => useApi(), { wrapper });

      await act(async () => {
        await result.current.addContact('Fail', 'fail@test.com', 'test', 'user1');
      });

      expect(result.current.error).toBe(error);

      // Second call succeeds
      apiClient.post.mockResolvedValueOnce({ data: 'success' });

      await act(async () => {
        await result.current.addContact('Success', 'success@test.com', 'test', 'user1');
      });

      expect(result.current.error).toBe(null);
      expect(result.current.isLoading).toBe(false);

      consoleSpy.mockRestore();
    });

    it('should handle synchronous errors in apiCall and ensure finally block executes', async () => {
      // Create a mock that throws synchronously instead of rejecting a promise
      apiClient.post.mockImplementationOnce(() => {
        throw new Error('Sync error');
      });
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const wrapper = ({ children }) => <ApiProvider>{children}</ApiProvider>;
      const { result } = renderHook(() => useApi(), { wrapper });

      let apiResult;
      await act(async () => {
        apiResult = await result.current.addContact('Sync Fail', 'sync@test.com', 'test', 'user1');
      });

      expect(apiResult).toBe(false);
      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error.message).toBe('Sync error');
      expect(result.current.isLoading).toBe(false);

      consoleSpy.mockRestore();
    });

    it('should properly track isLoading state during API call', async () => {
      let resolveApi;
      const apiPromise = new Promise((resolve) => {
        resolveApi = resolve;
      });
      apiClient.get.mockReturnValueOnce(apiPromise);

      const wrapper = ({ children }) => <ApiProvider>{children}</ApiProvider>;
      const { result } = renderHook(() => useApi(), { wrapper });

      expect(result.current.isLoading).toBe(false);

      let actPromise;
      act(() => {
        actPromise = result.current.listDevices();
      });

      // After starting the call, isLoading should be true
      expect(result.current.isLoading).toBe(true);

      // Resolve the API call
      await act(async () => {
        resolveApi({ data: 'devices' });
        await actPromise;
      });

      // After completing the call, isLoading should be false
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('Electron Mode', () => {
    beforeEach(() => {
      vi.stubEnv('VITE_APP_MODE', 'electron');
    });

    it('should call electronAPI on addContact in electron mode', async () => {
      window.electronAPI.invoke.mockResolvedValueOnce({ data: 'success' });

      const wrapper = ({ children }) => <ApiProvider>{children}</ApiProvider>;
      const { result } = renderHook(() => useApi(), { wrapper });

      let apiResult;
      await act(async () => {
        apiResult = await result.current.addContact('John Doe', 'john@test.com', 'test-source', 'user1');
      });

      expect(apiResult).toEqual({ data: 'success' });
      expect(window.electronAPI.invoke).toHaveBeenCalledWith('db:addContact', {
        name: 'John Doe',
        email: 'john@test.com',
        source: 'test-source',
        userId: 'user1'
      });
      expect(apiClient.post).not.toHaveBeenCalled();
    });

    it('should map other methods to correct IPC channels', async () => {
      window.electronAPI.invoke.mockResolvedValue(true);

      const wrapper = ({ children }) => <ApiProvider>{children}</ApiProvider>;
      const { result } = renderHook(() => useApi(), { wrapper });

      await act(async () => {
        await result.current.listAllContacts('user2');
      });
      expect(window.electronAPI.invoke).toHaveBeenCalledWith('db:listAllContacts', 'user2');

      await act(async () => {
        await result.current.sendMessageToOnyx('hello');
      });
      expect(window.electronAPI.invoke).toHaveBeenCalledWith('onyx:sendMessage', 'hello');
    });
  });

  it('should maintain referential equality of API methods', () => {
    const wrapper = ({ children }) => <ApiProvider>{children}</ApiProvider>;
    const { result, rerender } = renderHook(() => useApi(), { wrapper });

    const initialAddContact = result.current.addContact;

    // Rerender to test equality
    rerender();

    expect(result.current.addContact).toBe(initialAddContact);
  });

  it('should memoize the context value object to prevent unnecessary re-renders', () => {
    const wrapper = ({ children }) => <ApiProvider>{children}</ApiProvider>;
    const { result, rerender } = renderHook(() => useApi(), { wrapper });

    const initialValue = result.current;

    rerender();

    // The context object reference should be exactly the same
    expect(result.current).toBe(initialValue);
  });
});
