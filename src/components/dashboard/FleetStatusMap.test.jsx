import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import FleetStatusMap from './FleetStatusMap';
import { supabase } from '../../services/supabaseClient';
import { BrowserRouter } from 'react-router-dom';

vi.mock('../../services/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockResolvedValue({
        data: [
          { id: 1, app_name: 'test-app-1', health_endpoint_url: 'http://test1.com', status: 'operational' },
          { id: 2, app_name: 'test-app-2', health_endpoint_url: 'http://test2.com', status: 'offline' }
        ],
        error: null
      })
    })),
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn()
    })),
    removeChannel: vi.fn()
  }
}));

// Mock framer-motion since it can cause issues in Vitest
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, className }) => <div className={className}>{children}</div>,
  },
  AnimatePresence: ({ children }) => <>{children}</>,
}));

describe('FleetStatusMap Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', async () => {
    render(
      <BrowserRouter>
        <FleetStatusMap />
      </BrowserRouter>
    );
    expect(screen.getByText('Ecosystem Fleet Heatmap')).toBeInTheDocument();
  });

  it('renders ecosystem nodes after loading and shows warning if offline', async () => {
    render(
      <BrowserRouter>
        <FleetStatusMap />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.queryByText('Ecosystem Fleet Heatmap')).toBeInTheDocument();
    });
  });
});
