import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import MetricsGrid from './MetricsGrid';
import { useMetrics } from '../../hooks/useMetrics';
import { useSupabase } from '../../contexts/SupabaseContext';

// Mock dependencies
vi.mock('../../hooks/useMetrics', () => ({
  useMetrics: vi.fn(),
}));

vi.mock('../../contexts/SupabaseContext', () => ({
  useSupabase: vi.fn(),
}));

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }) => <>{children}</>,
}));

const mockSupabase = {
  channel: vi.fn().mockReturnValue({
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn(),
  }),
  removeChannel: vi.fn(),
};

describe('MetricsGrid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSupabase.mockReturnValue({ supabase: mockSupabase });
  });

  const renderWithProvider = (ui) => {
    return render(ui);
  };

  it('should render loading skeletons when loading', () => {
    useMetrics.mockReturnValue({
      metrics: null,
      loading: true,
      error: null,
      refetch: vi.fn(),
    });

    renderWithProvider(<MetricsGrid />);
    const skeletons = screen.getAllByTestId('loading-skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('should render an error message when there is an error', () => {
    useMetrics.mockReturnValue({
      metrics: null,
      loading: false,
      error: 'Failed to load metrics',
      refetch: vi.fn(),
    });

    renderWithProvider(<MetricsGrid />);
    expect(screen.getByText('Failed to load metrics')).toBeInTheDocument();
  });

  it('should render all metric cards with correct data', () => {
    const mockMetricsData = {
      aiInteractions: 1890,
      activeEvents: 42,
      activeUsers: 156,
      totalGenerations: 850,
      totalContacts: 5000,
      newToday: 20
    };

    useMetrics.mockReturnValue({
      metrics: mockMetricsData,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    renderWithProvider(<MetricsGrid />);

    // Check titles
    expect(screen.getByText('Onyx AI')).toBeInTheDocument();
    expect(screen.getByText('Support SOC')).toBeInTheDocument();
    expect(screen.getByText('Hardware Link')).toBeInTheDocument();
    expect(screen.getByText('Micro Apps')).toBeInTheDocument();
    expect(screen.getByText('Finance Ledgers')).toBeInTheDocument();

    // Check values
    expect(screen.getByText('1,890')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('156')).toBeInTheDocument();
    expect(screen.getByText('850')).toBeInTheDocument();
    expect(screen.getByText('$1,275')).toBeInTheDocument(); // 850 * 1.5
  });
});
