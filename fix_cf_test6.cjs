const fs = require('fs');

const healthTestPath = 'src/components/dashboard/CloudflareEdgeHealth.test.jsx';
const content = `import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CloudflareEdgeHealth from './CloudflareEdgeHealth';
import toast from 'react-hot-toast';

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../contexts/RealtimeContext', () => ({
  useRealtime: vi.fn(() => ({ isConnected: true }))
}));

vi.mock('../../services/supabaseClient', () => ({
  supabase: {
    channel: vi.fn().mockReturnValue({
       on: vi.fn().mockReturnThis(),
       subscribe: vi.fn().mockReturnThis(),
    }),
    removeChannel: vi.fn()
  }
}));

// Mock fetch globally
global.fetch = vi.fn();

describe('CloudflareEdgeHealth', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn();
    localStorage.clear();
  });

  it('renders correctly with default state', () => {
    render(<CloudflareEdgeHealth />);
    expect(screen.getByText('Cloudflare Edge Gateway')).toBeInTheDocument();
    expect(screen.getByText('ONLINE')).toBeInTheDocument(); // Default status
  });

  it('handles edge ping success', async () => {
    global.fetch.mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('/api/edge/healthz')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: 'active', edge_location: 'test-colo' }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    render(<CloudflareEdgeHealth />);

    const refreshButton = screen.getByText('Refresh Diagnostics');
    await act(async () => {
      fireEvent.click(refreshButton);
    });

    expect(screen.getByText('Pinging...')).toBeInTheDocument();

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/edge/healthz', expect.any(Object));
      // Checks for some ms value which indicates success
      expect(screen.getByText(/ms/)).toBeInTheDocument();
      expect(screen.getByText('ONLINE')).toBeInTheDocument();
    });
  });

  it('handles edge ping failure gracefully', async () => {
    global.fetch.mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('/api/edge/healthz')) {
        return Promise.reject(new Error('Network error'));
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    render(<CloudflareEdgeHealth />);

    const refreshButton = screen.getByText('Refresh Diagnostics');
    await act(async () => {
      fireEvent.click(refreshButton);
    });

    await waitFor(() => {
      expect(screen.getByText('DEGRADED')).toBeInTheDocument();
      expect(screen.getByText('timeout')).toBeInTheDocument();
      expect(toast.error).toHaveBeenCalledWith('Failed to reach Cloudflare Edge Gateway');
    });
  });

  it('listens to custom window events for status updates', async () => {
    render(<CloudflareEdgeHealth />);

    // Dispatch degraded event
    act(() => {
      window.dispatchEvent(new Event('edge:degraded'));
    });
    await waitFor(() => {
      expect(screen.getByText('DEGRADED')).toBeInTheDocument();
    });

    // Dispatch healthy event
    act(() => {
      window.dispatchEvent(new Event('edge:healthy'));
    });
    await waitFor(() => {
      expect(screen.getByText('ONLINE')).toBeInTheDocument();
    });
  });
});
`;

fs.writeFileSync(healthTestPath, content, 'utf8');
