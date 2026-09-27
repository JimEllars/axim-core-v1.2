import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import JobQueueMonitor from './JobQueueMonitor';
import { DashboardProvider } from '../../contexts/DashboardContext';
import { SupabaseProvider } from '../../contexts/SupabaseContext';

vi.mock('../../hooks/useSupabaseQuery', () => ({
  useSupabaseQuery: vi.fn((key) => {
    if (key === 'get_dead_letter_jobs') {
        return { data: [], loading: false, error: null, refetch: vi.fn() }
    }
    return { data: [], loading: false, error: null, refetch: vi.fn() }
  })
}));

vi.mock('../../services/supabaseClient', () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    }),
    rpc: vi.fn(),
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    }),
    removeChannel: vi.fn()
  },
  supabaseClient: {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
  },
  functions: {
    invoke: vi.fn().mockResolvedValue({ data: null, error: null })
  },
  rpc: vi.fn().mockResolvedValue({ data: null, error: null })
}));

import { act } from '@testing-library/react';
import { supabase } from '../../services/supabaseClient';

describe('JobQueueMonitor', () => {
  it('renders loading state initially', async () => {
    render(<DashboardProvider><SupabaseProvider><JobQueueMonitor /></SupabaseProvider></DashboardProvider>);
  });

  it('renders the header after loading', async () => {
    render(<DashboardProvider><SupabaseProvider><JobQueueMonitor /></SupabaseProvider></DashboardProvider>);
    await waitFor(() => {
      expect(screen.getByText(/Job Queue/i)).toBeInTheDocument();
    });
  });

  it('requeues a dead-letter job through the retry RPC', async () => {
    const select = vi.fn().mockReturnThis();
    const order = vi.fn().mockResolvedValue({
      data: [{ id: 'dead-letter-job', task_type: 'email', error_log: 'Timed out', created_at: '2026-01-01T00:00:00Z' }],
      error: null,
    });
    supabase.from = vi.fn().mockReturnValue({ select, order });
    supabase.rpc = vi.fn().mockResolvedValue({ data: true, error: null });

    render(<DashboardProvider><SupabaseProvider><JobQueueMonitor /></SupabaseProvider></DashboardProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Dead Letter Queue (DLQ)' }));

    await waitFor(() => expect(screen.getByText('Timed out')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Retry Job' }));

    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith('retry_dead_letter_job', { target_job_id: 'dead-letter-job' });
    });
  });
});