import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
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
});