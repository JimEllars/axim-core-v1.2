import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useSupabaseQuery } from './useSupabaseQuery';
import { supabase } from '../services/supabaseClient';
import { useDashboard } from '../contexts/DashboardContext';
import toast from 'react-hot-toast';

vi.mock('../services/supabaseClient', () => ({
  supabase: {
    rpc: vi.fn(),
  },
}));

vi.mock('../contexts/DashboardContext', () => ({
  useDashboard: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({
  default: {
    error: vi.fn(),
  },
}));

describe('useSupabaseQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useDashboard.mockReturnValue({ refreshKey: 0 });

    // Default successful response
    supabase.rpc.mockReturnValue(Promise.resolve({
      data: [{ id: 1, name: 'Test' }],
      error: null,
    }));
  });

  it('should fetch data automatically on mount by default', async () => {
    const { result } = renderHook(() => useSupabaseQuery('test_rpc'));

    // Initially loading
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toEqual([]);
    expect(result.current.error).toBe(null);

    // Wait for the fetch to complete
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(supabase.rpc).toHaveBeenCalledWith('test_rpc');
    expect(result.current.data).toEqual([{ id: 1, name: 'Test' }]);
    expect(result.current.error).toBe(null);
  });

  it('should not fetch data automatically if autoFetch is false', async () => {
    const { result } = renderHook(() => useSupabaseQuery('test_rpc', { autoFetch: false }));

    // Should not be loading initially
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toEqual([]);
    expect(result.current.error).toBe(null);

    // Give it a moment to make sure no fetch happens
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
  });

  it('should fetch data when refetch is called manually', async () => {
    const { result } = renderHook(() => useSupabaseQuery('test_rpc', { autoFetch: false }));

    expect(supabase.rpc).not.toHaveBeenCalled();

    act(() => {
      result.current.refetch();
    });

    // Should be loading immediately after refetch is called
    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(supabase.rpc).toHaveBeenCalledWith('test_rpc');
    expect(result.current.data).toEqual([{ id: 1, name: 'Test' }]);
  });

  it('should handle errors correctly', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const mockError = new Error('RPC Failed');
    supabase.rpc.mockReturnValueOnce(Promise.resolve({
      data: null,
      error: mockError,
    }));

    const { result } = renderHook(() => useSupabaseQuery('test_rpc'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(supabase.rpc).toHaveBeenCalledWith('test_rpc');
    expect(result.current.error).toEqual(mockError);
    expect(result.current.data).toEqual([]);
    expect(toast.error).toHaveBeenCalledWith('Error fetching data from test_rpc');
    expect(consoleSpy).toHaveBeenCalledWith('Error fetching data from test_rpc:', mockError);

    consoleSpy.mockRestore();
  });

  it('should refetch data when refreshKey changes', async () => {
    let currentRefreshKey = 0;
    useDashboard.mockImplementation(() => ({ refreshKey: currentRefreshKey }));

    const { rerender, result } = renderHook(() => useSupabaseQuery('test_rpc'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(supabase.rpc).toHaveBeenCalledTimes(1);

    // Change refreshKey and rerender
    currentRefreshKey = 1;
    rerender();

    await waitFor(() => {
      // It might go to loading=true and then false very quickly
      // So we wait until the second RPC call has completed
      expect(supabase.rpc).toHaveBeenCalledTimes(2);
    });
  });
});
