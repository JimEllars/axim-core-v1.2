// src/contexts/__tests__/ConnectivityContext.test.jsx
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConnectivityProvider, useConnectivity } from '../ConnectivityContext';
import connectivityManager from '@/services/connectivityManager';

// Mock the connectivityManager
vi.mock('@/services/connectivityManager', () => {
    const listeners = new Set();
    let isOnline = true;
    return {
        default: {
            getIsOnline: vi.fn(() => isOnline),
            subscribe: vi.fn((listener) => {
                listeners.add(listener);
                listener(isOnline); // Immediately notify with current status
                return () => listeners.delete(listener);
            }),
            __mockSetOnline: (status) => {
                isOnline = status;
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
    connectivityManager.__mockSetOnline(false);

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
});
