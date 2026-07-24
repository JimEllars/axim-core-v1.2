import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import MetricsGrid from '../src/components/dashboard/MetricsGrid';

// Mock contexts
vi.mock('../src/hooks/useMetrics', () => ({
  useMetrics: () => ({
    metrics: {
      totalGenerations: 420,
      cacheSavings: 35.5,
      aiGatewayMetrics: {
        total_requests: 100,
        cf_cache_hits: 25,
        estimated_cost_savings_usd: 12.34,
        total_tokens_processed: 123456
      }
    },
    loading: false,
    error: null,
    refetch: vi.fn()
  })
}));

vi.mock('../src/contexts/SupabaseContext', () => ({
  useSupabase: () => ({
    supabase: {
      channel: vi.fn().mockReturnThis(),
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
      removeChannel: vi.fn()
    }
  })
}));

vi.mock('../src/common/SafeIcon', () => ({
  default: () => <div data-testid="safe-icon" />
}));

describe('MetricsGrid Component', () => {
  it('renders AI Gateway Efficiency card correctly with calculated cache hit rate', () => {
    render(<MetricsGrid />);

    // Check if the title exists
    expect(screen.getByText('AI Gateway Efficiency')).toBeInTheDocument();

    // Check if the cache hit rate is calculated correctly (25 / 100 * 100) = 25.0%
    expect(screen.getByText('25.0%')).toBeInTheDocument();

    // Check if the subtext is formatted properly
    expect(screen.getByText('SAVINGS: $12.34 | TOKENS: 123,456')).toBeInTheDocument();
  });
});
