import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { DashboardProvider, useDashboard } from './DashboardContext';

describe('DashboardContext', () => {
  const wrapper = ({ children }) => (
    <DashboardProvider>{children}</DashboardProvider>
  );

  it('should provide initial context values', () => {
    const { result } = renderHook(() => useDashboard(), { wrapper });

    expect(result.current.activeTab).toBe('overview');
    expect(result.current.isDrawerOpen).toBe(false);
    expect(result.current.selectedWidget).toBe(null);
    expect(result.current.refreshKey).toBe(0);
    expect(typeof result.current.refreshDashboard).toBe('function');
    expect(typeof result.current.setActiveTab).toBe('function');
    expect(typeof result.current.setIsDrawerOpen).toBe('function');
    expect(typeof result.current.setSelectedWidget).toBe('function');
    expect(typeof result.current.openDrawer).toBe('function');
    expect(typeof result.current.closeDrawer).toBe('function');
  });

  it('should change active tab', () => {
    const { result } = renderHook(() => useDashboard(), { wrapper });

    act(() => {
      result.current.setActiveTab('analytics');
    });

    expect(result.current.activeTab).toBe('analytics');
  });

  it('should open and close drawer with correct state updates', () => {
    const { result } = renderHook(() => useDashboard(), { wrapper });

    const mockWidget = { id: 'widget-1', type: 'chart' };

    act(() => {
      result.current.openDrawer(mockWidget);
    });

    expect(result.current.isDrawerOpen).toBe(true);
    expect(result.current.selectedWidget).toEqual(mockWidget);

    act(() => {
      result.current.closeDrawer();
    });

    expect(result.current.isDrawerOpen).toBe(false);
    expect(result.current.selectedWidget).toBeNull();
  });

  it('should increment refreshKey and maintain refreshDashboard reference', () => {
    const { result, rerender } = renderHook(() => useDashboard(), { wrapper });

    expect(result.current.refreshKey).toBe(0);

    // Store reference to check if it's stable
    const initialRefreshDashboard = result.current.refreshDashboard;

    act(() => {
      result.current.refreshDashboard();
    });

    expect(result.current.refreshKey).toBe(1);

    act(() => {
      result.current.refreshDashboard();
    });

    expect(result.current.refreshKey).toBe(2);

    // Force a re-render to check reference stability
    rerender();

    // The reference to refreshDashboard should remain the same due to useCallback
    expect(result.current.refreshDashboard).toBe(initialRefreshDashboard);
  });

  it('should allow functional state updates for setters', () => {
    const { result } = renderHook(() => useDashboard(), { wrapper });

    act(() => {
      result.current.setActiveTab(prev => prev === 'overview' ? 'detailed' : 'overview');
    });

    expect(result.current.activeTab).toBe('detailed');
  });

  it('should return undefined when useDashboard is used outside of DashboardProvider', () => {
    // Expected behavior when context has no default value and is used without a provider
    const { result } = renderHook(() => useDashboard());
    expect(result.current).toBeUndefined();
  });
});
