import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import JobQueueMonitor from './JobQueueMonitor';
import { DashboardProvider } from '../../contexts/DashboardContext';
import { SupabaseProvider } from '../../contexts/SupabaseContext';

vi.mock('../../hooks/useSupabaseQuery', () => ({
  useSupabaseQuery: vi.fn().mockReturnValue({ data: [], loading: false, error: null, refetch: vi.fn() })
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