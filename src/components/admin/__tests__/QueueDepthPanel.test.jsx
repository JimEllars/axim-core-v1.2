import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import QueueDepthPanel from '../QueueDepthPanel';

// Mock Dependencies
vi.mock('../../../services/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
            order: vi.fn(() => ({
                limit: vi.fn(() => Promise.resolve({ data: [], error: null }))
            })),
            limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
            then: (resolve) => resolve({ data: [], count: 1, error: null })
        })),
        order: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve({ data: [], error: null }))
        })),
        then: (resolve) => resolve({ data: [], count: 1, error: null }),
        limit: vi.fn(() => Promise.resolve({ data: [], error: null }))
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
    // Measured at 4.0 s solo and over 5 s when the suite runs two workers on a
    // 2 vCPU box, so the default budget fails on load rather than on behaviour.
    // The component renders five panels and awaits a six-query Promise.all; the
    // cost is jsdom plus the component graph, not a hang.
  }, 15_000);
});
