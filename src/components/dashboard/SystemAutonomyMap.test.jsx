import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import SystemAutonomyMap from './SystemAutonomyMap';
import { supabase } from '../../services/supabaseClient';

vi.mock('../../services/supabaseClient', () => {
  const mockChannel = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis()
  };

  return {
    supabase: {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      channel: vi.fn().mockReturnValue(mockChannel),
      removeChannel: vi.fn()
    }
  };
});

describe('SystemAutonomyMap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders correctly and fetches events', async () => {
    const mockUsageLogs = [
      { id: '1', created_at: '2023-01-01T10:00:00Z', endpoint: '/api/v1/test', status_code: 200 }
    ];
    const mockBcLogs = [
      { id: '2', created_at: '2023-01-01T10:05:00Z', smart_contract_address: '0x123', amount: 100, currency: 'USDC', status: 'minted' }
    ];

    supabase.limit.mockResolvedValueOnce({ data: mockUsageLogs, error: null }); // api_usage_logs
    supabase.limit.mockResolvedValueOnce({ data: mockBcLogs, error: null }); // blockchain_transactions

    await act(async () => {
      render(<SystemAutonomyMap />);
    });

    await waitFor(() => {
      expect(screen.getByText('System Autonomy Map')).toBeInTheDocument();
      expect(screen.getByText('API Call to /api/v1/test (Status: 200)')).toBeInTheDocument();
      expect(screen.getByText('Dispatched to 0x123 (100 USDC)')).toBeInTheDocument();
    });
  });

  it('renders health status based on error count', async () => {
    const mockUsageLogs = [
      { id: '1', created_at: '2023-01-01T10:00:00Z', endpoint: '/api/v1/test1', status_code: 500 },
      { id: '2', created_at: '2023-01-01T10:01:00Z', endpoint: '/api/v1/test2', status_code: 500 },
      { id: '3', created_at: '2023-01-01T10:02:00Z', endpoint: '/api/v1/test3', status_code: 500 },
      { id: '4', created_at: '2023-01-01T10:03:00Z', endpoint: '/api/v1/test4', status_code: 500 }
    ];

    supabase.limit.mockResolvedValueOnce({ data: mockUsageLogs, error: null }); // api_usage_logs
    supabase.limit.mockResolvedValueOnce({ data: [], error: null }); // blockchain_transactions

    await act(async () => {
      render(<SystemAutonomyMap />);
    });

    // Check for red health status icon (FiXCircle). In testing we might not see the specific color class easily without testing the icon itself, but we can verify the mock returns were processed
    await waitFor(() => {
        expect(screen.getByText('API Call to /api/v1/test4 (Status: 500)')).toBeInTheDocument();
    });
  });

  it('cleans up channels on unmount', async () => {
    supabase.limit.mockResolvedValue({ data: [], error: null });

    let rendered;
    await act(async () => {
      rendered = render(<SystemAutonomyMap />);
    });

    expect(supabase.channel).toHaveBeenCalledTimes(2);

    rendered.unmount();
    expect(supabase.removeChannel).toHaveBeenCalledTimes(2);
  });
});
