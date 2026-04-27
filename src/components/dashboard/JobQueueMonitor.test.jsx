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

describe('JobQueueMonitor', () => {
  it('renders loading state initially', () => {
    render(<JobQueueMonitor />);
    expect(screen.getByText('Loading Job Queue...')).toBeInTheDocument();
  });

  it('renders the header after loading', async () => {
    render(<JobQueueMonitor />);
    await waitFor(() => {
      expect(screen.getByText('Mission Control: Job Queue')).toBeInTheDocument();
    });
  });
});
