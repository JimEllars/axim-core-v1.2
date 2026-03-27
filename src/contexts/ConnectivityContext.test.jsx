import React from 'react';
import { render, screen, act, renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConnectivityProvider, useConnectivity } from './ConnectivityContext';
import connectivityManager from '@/services/connectivityManager';

const TestComponent = () => {
  const isOnline = useConnectivity();
  return <div>{isOnline ? 'Online' : 'Offline'}</div>;
};

describe('ConnectivityContext', () => {
  beforeEach(() => {
    // Reset to online state before each test so tests don't pollute each other
    act(() => {
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
      window.dispatchEvent(new Event('online'));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('provides the initial online status', () => {
    render(
      <ConnectivityProvider>
        <TestComponent />
      </ConnectivityProvider>
    );
    expect(screen.getByText('Online')).toBeInTheDocument();
  });

  it('provides the initial offline status when starting offline', () => {
    // Override the beforeEach mock for this specific test
    vi.spyOn(connectivityManager, 'getIsOnline').mockReturnValueOnce(false);

    // Also mock navigator to be offline
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    window.dispatchEvent(new Event('offline'));

    render(
      <ConnectivityProvider>
        <TestComponent />
      </ConnectivityProvider>
    );

    // It should render offline because connectivityManager.getIsOnline() returns false
    expect(screen.getByText('Offline')).toBeInTheDocument();
  });

  it('provides the default fallback status (true) when useConnectivity is called outside provider', () => {
    // Test the default value of the context (true) without the ConnectivityProvider
    render(<TestComponent />);
    expect(screen.getByText('Online')).toBeInTheDocument();
  });

  it('updates when the connectivity status changes to offline via window event', () => {
    render(
      <ConnectivityProvider>
        <TestComponent />
      </ConnectivityProvider>
    );

    // Initial state is online
    expect(screen.getByText('Online')).toBeInTheDocument();

    // Trigger offline event
    act(() => {
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
      window.dispatchEvent(new Event('offline'));
    });

    // Component should rerender with offline state
    expect(screen.getByText('Offline')).toBeInTheDocument();
  });

  it('updates when the connectivity status changes back to online via window event', () => {
    render(
      <ConnectivityProvider>
        <TestComponent />
      </ConnectivityProvider>
    );

    // Start offline
    act(() => {
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByText('Offline')).toBeInTheDocument();

    // Trigger online event
    act(() => {
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
      window.dispatchEvent(new Event('online'));
    });

    // Component should rerender with online state
    expect(screen.getByText('Online')).toBeInTheDocument();
  });

  it('cleans up connectivityManager subscription on unmount', () => {
    const unsubscribeMock = vi.fn();
    const subscribeSpy = vi.spyOn(connectivityManager, 'subscribe').mockReturnValue(unsubscribeMock);

    const { unmount } = render(
      <ConnectivityProvider>
        <TestComponent />
      </ConnectivityProvider>
    );

    expect(subscribeSpy).toHaveBeenCalledTimes(1);

    unmount();

    expect(unsubscribeMock).toHaveBeenCalledTimes(1);

    subscribeSpy.mockRestore();
  });

  it('useConnectivity hook works properly within provider', () => {
    const { result } = renderHook(() => useConnectivity(), {
      wrapper: ConnectivityProvider,
    });

    expect(result.current).toBe(true); // Default starting state based on mock

    act(() => {
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
      window.dispatchEvent(new Event('offline'));
    });

    expect(result.current).toBe(false);
  });

  it('useConnectivity hook starts false when app initializes offline', () => {
    // Override the getIsOnline mock for this test
    vi.spyOn(connectivityManager, 'getIsOnline').mockReturnValueOnce(false);

    // Also mock navigator to be offline
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    window.dispatchEvent(new Event('offline'));

    const { result } = renderHook(() => useConnectivity(), {
      wrapper: ConnectivityProvider,
    });

    // Should start false based on getIsOnline mock
    expect(result.current).toBe(false);

    // Should transition to online
    act(() => {
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
      window.dispatchEvent(new Event('online'));
    });

    expect(result.current).toBe(true);
  });
});
