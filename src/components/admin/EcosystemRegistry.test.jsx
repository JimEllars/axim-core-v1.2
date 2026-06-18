import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import EcosystemRegistry from './EcosystemRegistry';
import { supabase } from '../../services/supabaseClient';

vi.mock('../../services/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn().mockResolvedValue({
          data: [
            { id: 1, app_name: 'test-app-1', health_endpoint_url: 'http://test1.com', status: 'operational' },
            { id: 2, app_name: 'test-app-2', health_endpoint_url: 'http://test2.com', status: 'offline' }
          ],
          error: null
        })
      }))
    }))
  }
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn()
  }
}));

describe('EcosystemRegistry Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', async () => {
    render(<EcosystemRegistry />);
    expect(screen.getByText('Loading registry...')).toBeInTheDocument();

    // Wait for the state update from the initial fetch to clear the warning
    await waitFor(() => {
        expect(screen.queryByText('Loading registry...')).not.toBeInTheDocument();
    });
  });

  it('renders ecosystem nodes after loading', async () => {
    render(<EcosystemRegistry />);

    expect(await screen.findByText('test-app-1')).toBeInTheDocument();
    expect(await screen.findByText('test-app-2')).toBeInTheDocument();
  });

  it('computes degraded on stale heartbeat', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-06-16T12:00:00Z'));

    // 10 minutes ago
    const staleTime = new Date('2026-06-16T11:50:00Z').toISOString();

    supabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: [{ id: 1, app_name: 'Stale App', status: 'operational', last_ping: staleTime }],
        error: null
      })
    });

    await act(async () => {
      render(<EcosystemRegistry />);
    });

    await waitFor(() => {
      expect(screen.getByText('Degraded')).toBeInTheDocument();
    });

    vi.useRealTimers();
  });
});
