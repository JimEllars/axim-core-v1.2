import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import AIInteractionsChart from './AIInteractionsChart';
import { useSupabaseQuery } from '../../hooks/useSupabaseQuery';
import { DashboardProvider } from '../../contexts/DashboardContext';
import React from 'react';

// Mock dependencies
vi.mock('../../hooks/useSupabaseQuery');
vi.mock('recharts', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        ResponsiveContainer: ({ children }) => (
            <div className="recharts-responsive-container" style={{ width: '100%', height: '100%', minWidth: 0 }}>
                {React.cloneElement(children, { width: 500, height: 500 })}
            </div>
        ),
    };
});

const renderWithProvider = (component) => {
  return render(<DashboardProvider>{component}</DashboardProvider>);
};

describe('AIInteractionsChart', () => {

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should render the chart with data', async () => {
    const mockData = [
      { date: '2023-01-01', count: 10 },
      { date: '2023-01-02', count: 20 },
    ];
    useSupabaseQuery.mockReturnValue({ data: mockData, loading: false });

    renderWithProvider(<AIInteractionsChart />);

    // Wait for the chart to render
    await screen.findByText('AI Interactions Over Time');

    // Check that the chart is rendered
    expect(screen.getByText('Daily command usage')).toBeInTheDocument();
  });

  it('should show a loading spinner while fetching data', () => {
    useSupabaseQuery.mockReturnValue({ data: null, loading: true });

    renderWithProvider(<AIInteractionsChart />);

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('should render an empty state when there is an error', async () => {
    // The hook itself handles the error and returns null data.
    // The component just needs to render correctly with that null data.
    useSupabaseQuery.mockReturnValue({ data: [], loading: false });

    renderWithProvider(<AIInteractionsChart />);

    // Wait for the title to appear
    await screen.findByText('AI Interactions Over Time');

    // Check that the chart is still rendered, but with no data and no spinner
    expect(screen.getByText('Daily command usage')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });
});
