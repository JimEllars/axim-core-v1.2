import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import QueueDepthPanel from '../QueueDepthPanel';

// Mock Dependencies
vi.mock('../../services/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ count: 1, error: null }))
      }))
    }))
  }
}));

describe('QueueDepthPanel Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  it('renders correctly and loads data', async () => {
    render(<QueueDepthPanel />);

    await waitFor(() => {
      expect(screen.getByText('Queue & Automation Depth')).toBeInTheDocument();
      expect(screen.getByText('Pending Jobs')).toBeInTheDocument();
      expect(screen.getByText('Active Cron Tasks')).toBeInTheDocument();
      expect(screen.getByText('Dead Letters (DLQ)')).toBeInTheDocument();
      expect(screen.getByText('Critical Failures')).toBeInTheDocument();
    });
  });
});
