import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import MetricsGrid from './MetricsGrid';
import { useMetrics } from '../../hooks/useMetrics';
import { DashboardProvider } from '../../contexts/DashboardContext';

vi.mock('../../hooks/useMetrics');

const mockMetrics = {
  totalContacts: 1250,
  contactChange: 5.2,
  newToday: 25,
  activeUsers: 300,
  activeEvents: 5420,
  aiInteractions: 1890,
  workflowsTriggered: 120,
};

const defaultMetrics = {
  totalContacts: 0,
  contactChange: 0,
  newToday: 0,
  activeUsers: 0,
  activeEvents: 0,
  aiInteractions: 0,
  workflowsTriggered: 0,
};

const renderWithProvider = (ui) => {
  return render(<DashboardProvider>{ui}</DashboardProvider>);
}

describe('MetricsGrid', () => {
  it('should render loading skeletons when loading', () => {
    useMetrics.mockReturnValue({ metrics: defaultMetrics, loading: true, error: null });
    renderWithProvider(<MetricsGrid />);

    const loadingElements = screen.getAllByTestId('loading-skeleton');
    expect(loadingElements.length).toBeGreaterThan(0);
    loadingElements.forEach(el => {
      expect(el).toHaveClass('animate-pulse');
    });
  });

  it('should render an error message when there is an error', () => {
    const errorMessage = 'Failed to fetch metrics';
    useMetrics.mockReturnValue({ metrics: defaultMetrics, loading: false, error: errorMessage });
    renderWithProvider(<MetricsGrid />);

    expect(screen.getByText(errorMessage)).toBeInTheDocument();
  });

  it('should render all metric cards with correct data', () => {
    useMetrics.mockReturnValue({ metrics: mockMetrics, loading: false, error: null });
    renderWithProvider(<MetricsGrid />);

    expect(screen.getByText('Total Contacts')).toBeInTheDocument();
    expect(screen.getByText('1,250')).toBeInTheDocument();
    expect(screen.getByText('+5.2%')).toBeInTheDocument();

    expect(screen.getByText('New Today')).toBeInTheDocument();
    expect(screen.getByText('25')).toBeInTheDocument();

    expect(screen.getByText('Active Users')).toBeInTheDocument();
    expect(screen.getByText('300')).toBeInTheDocument();

    expect(screen.getByText('Total System Events')).toBeInTheDocument();
    expect(screen.getByText('5,420')).toBeInTheDocument();

    expect(screen.getByText('Total AI Interactions')).toBeInTheDocument();
    expect(screen.getByText('1,890')).toBeInTheDocument();

    expect(screen.getByText('Workflows Triggered')).toBeInTheDocument();
    expect(screen.getByText('120')).toBeInTheDocument();
  });

  it('should display negative contact change correctly', () => {
    useMetrics.mockReturnValue({
      metrics: { ...mockMetrics, contactChange: -2.1 },
      loading: false,
      error: null
    });
    renderWithProvider(<MetricsGrid />);
    const changeElement = screen.getByText('-2.1%');
    expect(changeElement).toBeInTheDocument();
    expect(changeElement).toHaveClass('text-red-400');
  });

  it('should display N/A for null contact change', () => {
    useMetrics.mockReturnValue({
      metrics: { ...mockMetrics, contactChange: null },
      loading: false,
      error: null
    });
    renderWithProvider(<MetricsGrid />);
    const changeElement = screen.getByText('N/A');
    expect(changeElement).toBeInTheDocument();
    expect(changeElement).toHaveClass('text-slate-300');
  });
});
