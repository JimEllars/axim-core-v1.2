import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConnectivityProvider, useConnectivity } from './ConnectivityContext';
import connectivityManager from '@/services/connectivityManager';

// Mock the connectivityManager
const mockUnsubscribe = vi.fn();
let listeners = new Set();
let mockIsOnline = true;

vi.mock('@/services/connectivityManager', () => {
  return {
    default: {
      getIsOnline: vi.fn(() => mockIsOnline),
      subscribe: vi.fn((listener) => {
        listeners.add(listener);
        listener(mockIsOnline); // Immediately notify with current status
        return () => {
          listeners.delete(listener);
          mockUnsubscribe();
        };
      }),
      __mockSetOnline: (status) => {
        mockIsOnline = status;
        listeners.forEach(listener => listener(status));
      }
    }
  };
});

const TestComponent = () => {
  const isOnline = useConnectivity();
  return <div>{isOnline ? 'Online' : 'Offline'}</div>;
};

describe('ConnectivityContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUnsubscribe.mockClear();
    listeners = new Set();
    mockIsOnline = true;
    connectivityManager.__mockSetOnline(true); // Reset to online before each test
  });

  it('provides the initial online status', () => {
    render(
      <ConnectivityProvider>
        <TestComponent />
      </ConnectivityProvider>
    );
    expect(screen.getByText('Online')).toBeInTheDocument();
  });

  it('provides the initial offline status', () => {
    mockIsOnline = false;
    render(
      <ConnectivityProvider>
        <TestComponent />
      </ConnectivityProvider>
    );
    expect(screen.getByText('Offline')).toBeInTheDocument();
  });

  it('updates when the connectivity status changes to offline', () => {
    render(
      <ConnectivityProvider>
        <TestComponent />
      </ConnectivityProvider>
    );

    act(() => {
      connectivityManager.__mockSetOnline(false);
    });

    expect(screen.getByText('Offline')).toBeInTheDocument();
  });

  it('updates when the connectivity status changes back to online', () => {
    // Start offline
    mockIsOnline = false;

    render(
      <ConnectivityProvider>
        <TestComponent />
      </ConnectivityProvider>
    );
    expect(screen.getByText('Offline')).toBeInTheDocument();

    act(() => {
      connectivityManager.__mockSetOnline(true);
    });

    expect(screen.getByText('Online')).toBeInTheDocument();
  });

  it('unsubscribes from connectivityManager on unmount', () => {
    const { unmount } = render(
      <ConnectivityProvider>
        <TestComponent />
      </ConnectivityProvider>
    );

    unmount();

    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });
});
