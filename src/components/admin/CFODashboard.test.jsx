import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import CFODashboard from './CFODashboard';

vi.mock('../../hooks/useSupabaseQuery', () => ({
  useSupabaseQuery: () => ({
    data: [],
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'test-user', role: 'admin' } }),
}));

describe('CFODashboard', () => {
  it('renders correctly', () => {
    render(<CFODashboard />);
    expect(screen.getByText('CFO Dashboard')).toBeInTheDocument();
  });
});
