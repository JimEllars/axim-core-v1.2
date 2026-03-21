import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useMetrics } from './useMetrics';
import * as useApi from './useApi'; // Mock the entire module
import config from '../config';
import { useDashboard } from '../contexts/DashboardContext';

// Mock dependencies
vi.mock('./useApi');
vi.mock('../config');
vi.mock('../contexts/DashboardContext');

describe('useMetrics', () => {
  const useApiMock = useApi.useApi;

  beforeEach(() => {
    vi.clearAllMocks();
    useDashboard.mockReturnValue({ refreshKey: 0 });
    useApiMock.mockReturnValue({
      data: null,
      loading: true,
      error: null,
      refetch: vi.fn(),
    });
  });

  it('should return the loading state from useApi', () => {
    const { result } = renderHook(() => useMetrics());
    expect(result.current.loading).toBe(true);
  });

  it('should return metrics from useApi data', async () => {
    const mockMetrics = { totalContacts: 123, activeUsers: 10 };
    useApiMock.mockReturnValue({
      data: mockMetrics,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    const { result } = renderHook(() => useMetrics());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.metrics).toBe(mockMetrics);
    });
  });

  it('should return an error from useApi', async () => {
    const mockError = new Error('Failed to fetch');
    useApiMock.mockReturnValue({
      data: null,
      loading: false,
      error: mockError,
      refetch: vi.fn(),
    });

    const { result } = renderHook(() => useMetrics());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe(mockError);
    });
  });

  it('should select the correct API call function based on mock status', async () => {
    // Case 1: Mock mode is enabled
    config.isMockLlmEnabled = true;
    renderHook(() => useMetrics());
    const apiCallForMockMode = useApiMock.mock.calls[0][0];
    await expect(apiCallForMockMode()).resolves.toHaveProperty('totalContacts', 1337);

    // Case 2: Mock mode is disabled
    config.isMockLlmEnabled = false;
    renderHook(() => useMetrics());
    const apiCallForRealMode = useApiMock.mock.calls[1][0];
    // We can't test the result easily, but we know it's a different function
    expect(apiCallForRealMode).not.toBe(apiCallForMockMode);
  });

  it('should pass the refreshKey as a dependency to useApi', () => {
    const { rerender } = renderHook(() => useMetrics());

    // Check the dependencies on the initial render
    expect(useApiMock).toHaveBeenCalledWith(expect.any(Function), [0], { cache: true });

    // Change the refreshKey and rerender
    useDashboard.mockReturnValue({ refreshKey: 10 });
    rerender();

    // Check that the dependencies passed to useApi have been updated
    expect(useApiMock).toHaveBeenCalledWith(expect.any(Function), [10], { cache: true });
  });
});
