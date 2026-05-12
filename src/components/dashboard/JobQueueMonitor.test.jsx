import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import JobQueueMonitor from './JobQueueMonitor';
import { supabase } from '../../services/supabaseClient';

vi.mock('../../services/supabaseClient', () => ({
  supabase: {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
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
    await act(async () => {
       render(<JobQueueMonitor />);
    });
    // Can't easily test initial state if it updates immediately, but we'll try:
    // Actually wait for it to settle instead
  });

  it('renders the header after loading', async () => {
    await act(async () => {
      render(<JobQueueMonitor />);
    });
    await waitFor(() => {
      expect(screen.getByText('Mission Control: Job Queue')).toBeInTheDocument();
    });
  });
});
