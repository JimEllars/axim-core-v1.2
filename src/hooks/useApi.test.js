import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, } from 'vitest';
import { useApi } from './useApi';
import toast from 'react-hot-toast';

vi.mock('react-hot-toast', () => ({
  default: {
    error: vi.fn(),
  },
}));

describe('useApi', () => {
  let mockApiCall;

  beforeEach(() => {
    vi.clearAllMocks();
    mockApiCall = vi.fn();
  });

  it('should fetch data successfully on mount', async () => {
    const mockData = { id: 1, name: 'Test' };
    mockApiCall.mockResolvedValueOnce(mockData);

    const { result } = renderHook(() => useApi(mockApiCall));

    // Initially loading
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();

    // Wait for fetch to complete
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockApiCall).toHaveBeenCalledTimes(1);
    expect(result.current.data).toEqual(mockData);
    expect(result.current.error).toBeNull();
  });

  it('should handle API errors and show a toast', async () => {
    const mockError = new Error('API Error');
    mockApiCall.mockRejectedValueOnce(mockError);

    const { result } = renderHook(() => useApi(mockApiCall));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockApiCall).toHaveBeenCalledTimes(1);
    expect(result.current.error).toEqual(mockError);
    expect(result.current.data).toBeNull();
    expect(toast.error).toHaveBeenCalledWith('Failed to fetch data. Please try again.');
  });

  it('should refetch data when refetch is called', async () => {
    const mockData1 = { id: 1 };
    const mockData2 = { id: 2 };
    mockApiCall.mockResolvedValueOnce(mockData1).mockResolvedValueOnce(mockData2);

    const { result } = renderHook(() => useApi(mockApiCall));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toEqual(mockData1);
    expect(mockApiCall).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.refetch();
    });

    // Should be loading again
    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockApiCall).toHaveBeenCalledTimes(2);
    expect(result.current.data).toEqual(mockData2);
  });

  it('should re-fetch when dependencies change', async () => {
    const mockData1 = { id: 1 };
    const mockData2 = { id: 2 };
    mockApiCall.mockResolvedValueOnce(mockData1).mockResolvedValueOnce(mockData2);

    const { result, rerender } = renderHook(
      ({ deps }) => useApi(mockApiCall, deps),
      { initialProps: { deps: [1] } }
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockApiCall).toHaveBeenCalledTimes(1);
    expect(result.current.data).toEqual(mockData1);

    // Change dependency
    rerender({ deps: [2] });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Wait for the effect to run and data to update
    await waitFor(() => {
        expect(mockApiCall).toHaveBeenCalledTimes(2);
    });
    expect(result.current.data).toEqual(mockData2);
  });

  describe('caching', () => {
    // Clear the Map inside the module for testing
    // Since we can't directly access the unexported cache Map,
    // we use isolated tests with unique dependencies or function strings
    it('should cache successful responses when options.cache is true', async () => {
      const mockData = { id: 'cached' };
      // Make a unique api call function to avoid cache collisions
      const cachedApiCall = vi.fn(async () => {
          return mockData;
      });

      // First render - should make API call
      const { result, unmount } = renderHook(() => useApi(cachedApiCall, ['uniqueDep1'], { cache: true }));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(cachedApiCall).toHaveBeenCalledTimes(1);
      expect(result.current.data).toEqual(mockData);

      unmount();

      // Second render with same apiCall and dependencies - should use cache
      const { result: result2 } = renderHook(() => useApi(cachedApiCall, ['uniqueDep1'], { cache: true }));

      // loading might be true for a split second, or false immediately if it's synchronous
      await waitFor(() => {
        expect(result2.current.loading).toBe(false);
      });

      // Api shouldn't be called again
      expect(cachedApiCall).toHaveBeenCalledTimes(1);
      expect(result2.current.data).toEqual(mockData);
    });

    it('should not cache when options.cache is false', async () => {
      const mockData = { id: 'uncached' };
      const uncachedApiCall = vi.fn().mockResolvedValue(mockData);

      // First render
      const { result, unmount } = renderHook(() => useApi(uncachedApiCall, ['uniqueDep2'], { cache: false }));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(uncachedApiCall).toHaveBeenCalledTimes(1);

      unmount();

      // Second render
      const { result: result2 } = renderHook(() => useApi(uncachedApiCall, ['uniqueDep2'], { cache: false }));

      await waitFor(() => {
        expect(result2.current.loading).toBe(false);
      });

      expect(uncachedApiCall).toHaveBeenCalledTimes(2);
    });
  });
});
