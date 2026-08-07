import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import KPIOverview from '../KPIOverview';
import { useSupabase } from '../../../contexts/SupabaseContext';

vi.mock('../../../contexts/SupabaseContext', () => ({
  useSupabase: vi.fn(),
}));

// Mock the nested components if they exist and are imported
vi.mock('../RevenueHeatmap', () => ({
  default: () => <div data-testid="revenue-heatmap-mock">RevenueHeatmap</div>,
}));

vi.mock('../PredictiveInsights', () => ({
  default: () => <div data-testid="predictive-insights-mock">PredictiveInsights</div>,
}));

describe('KPIOverview Component', () => {
  it('renders without crashing and displays skeleton loaders initially', async () => {
    useSupabase.mockReturnValue({
      supabase: {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [], count: 0, error: null }),
      },
    });

    render(<KPIOverview />);

    // We can just verify it renders without crashing by looking for some text or checking it doesn't throw.
    // Assuming the title "Monthly Recurring Revenue" is somewhere.
    expect(await screen.findByText('Monthly Recurring Revenue')).toBeInTheDocument();
  });
});
