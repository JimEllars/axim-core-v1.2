import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CFODashboard from './CFODashboard';
import * as useSupabaseQueryMock from '../../hooks/useSupabaseQuery';
import { supabase } from '../../services/supabaseClient';
import api from '../../services/onyxAI/api';
import toast from 'react-hot-toast';

vi.mock('../../hooks/useSupabaseQuery');
vi.mock('../../services/supabaseClient', () => ({
  supabase: {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: [], error: null }),
  }
}));
vi.mock('../../services/onyxAI/api', () => ({
  default: {
    resolveHitlAction: vi.fn()
  }
}));
vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn()
  }
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'test-user', role: 'admin' } }),
}));

describe('CFODashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders correctly and loads data', async () => {
    useSupabaseQueryMock.useSupabaseQuery.mockReturnValue({
      data: null,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    supabase.order.mockResolvedValueOnce({
      data: [{
        id: '123',
        status: 'Pending',
        tool_called: JSON.stringify({ target_department: 'CFO', partner_id: 'P1', amount: '100' })
      }],
      error: null
    });

    render(<CFODashboard />);
    expect(screen.getByText('CFO Dashboard')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('P1')).toBeInTheDocument();
    });
  });

  it('handles approve action', async () => {
    const mockRefetch = vi.fn();
    useSupabaseQueryMock.useSupabaseQuery.mockReturnValue({
      data: null,
      loading: false,
      error: null,
      refetch: mockRefetch,
    });

    supabase.order.mockResolvedValueOnce({
      data: [{
        id: '123',
        status: 'Pending',
        tool_called: JSON.stringify({ target_department: 'CFO', partner_id: 'P1', amount: '100' })
      }],
      error: null
    });

    render(<CFODashboard />);

    await waitFor(() => {
        expect(screen.getByTitle('Approve')).toBeInTheDocument();
    });

    const approveBtn = screen.getByTitle('Approve');
    fireEvent.click(approveBtn);

    const confirmBtn = screen.getByText('Confirm Approved');
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(api.resolveHitlAction).toHaveBeenCalledWith('123', 'Approved');
      expect(toast.success).toHaveBeenCalled();
      expect(mockRefetch).toHaveBeenCalled();
    });
  });

  it('handles error in fetch', async () => {
     useSupabaseQueryMock.useSupabaseQuery.mockReturnValue({
      data: null,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    supabase.order.mockResolvedValueOnce({
      data: null,
      error: new Error('Failed fetch')
    });

    render(<CFODashboard />);

    await waitFor(() => {
        expect(screen.getByText(/Failed to load approval requests:/)).toBeInTheDocument();
    });
  });

});
