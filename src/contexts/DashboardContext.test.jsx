import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { DashboardProvider, useDashboard } from './DashboardContext';

describe('DashboardContext', () => {
  it('should provide initial context values', () => {
    const wrapper = ({ children }) => (
      <DashboardProvider>{children}</DashboardProvider>
    );
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
    const wrapper = ({ children }) => (
      <DashboardProvider>{children}</DashboardProvider>
    );
    const { result } = renderHook(() => useDashboard(), { wrapper });

    act(() => {
      result.current.setActiveTab('analytics');
    });

    expect(result.current.activeTab).toBe('analytics');
  });

  it('should open and close drawer', () => {
    const wrapper = ({ children }) => (
      <DashboardProvider>{children}</DashboardProvider>
    );
    const { result } = renderHook(() => useDashboard(), { wrapper });

    const mockWidget = { id: 1, name: 'Test Widget' };

    act(() => {
      result.current.openDrawer(mockWidget);
    });

    expect(result.current.isDrawerOpen).toBe(true);
    expect(result.current.selectedWidget).toEqual(mockWidget);

    act(() => {
      result.current.closeDrawer();
    });

    expect(result.current.isDrawerOpen).toBe(false);
    expect(result.current.selectedWidget).toBe(null);
  });

  it('should increment refreshKey when refreshDashboard is called', () => {
    const wrapper = ({ children }) => (
      <DashboardProvider>{children}</DashboardProvider>
    );
    const { result } = renderHook(() => useDashboard(), { wrapper });

    expect(result.current.refreshKey).toBe(0);

    act(() => {
      result.current.refreshDashboard();
    });

    expect(result.current.refreshKey).toBe(1);

    act(() => {
      result.current.refreshDashboard();
    });

    expect(result.current.refreshKey).toBe(2);
  });

  it('should return undefined when useDashboard is used outside of DashboardProvider', () => {
    // This assumes createContext() was called without a default value
    const { result } = renderHook(() => useDashboard());
    expect(result.current).toBeUndefined();
  });
});
