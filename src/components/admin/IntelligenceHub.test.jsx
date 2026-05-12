import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import IntelligenceHub from './IntelligenceHub';
import { useVectorSearch } from '../../hooks/useVectorSearch';
import { useAuth } from '../../contexts/AuthContext';
import { useSupabase } from '../../contexts/SupabaseContext';

vi.mock('../../hooks/useVectorSearch', () => ({
  useVectorSearch: vi.fn(),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../../contexts/SupabaseContext', () => ({
  useSupabase: vi.fn(),
}));

// Mock Framer Motion to render children directly
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }) => {
      const { initial, animate, exit, transition, ...validProps } = props;
      return <div {...validProps}>{children}</div>;
    },
  },
  AnimatePresence: ({ children }) => <>{children}</>,
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('IntelligenceHub', () => {
  it('renders correctly', () => {
    useVectorSearch.mockReturnValue({
      searchMemory: vi.fn(),
      isSearching: false,
      results: null,
      error: null,
    });
    useAuth.mockReturnValue({ user: { id: 'test-id' } });

    // Mock Supabase with a valid channel implementation
    const mockChannel = {
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(),
    };
    useSupabase.mockReturnValue({
      supabase: {
        channel: vi.fn().mockReturnValue(mockChannel),
        removeChannel: vi.fn(),
      },
    });

    render(<IntelligenceHub />);

    expect(screen.getByText('Vector Intelligence Hub')).toBeInTheDocument();
    expect(screen.getByText('Live Ingestion Stream')).toBeInTheDocument();
  });
});
