import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ApprovalQueue from './ApprovalQueue';
import { supabase } from '../../services/supabaseClient';

vi.mock('../../services/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      update: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ error: null })
      })),
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: null })
        }))
      }))
    }))
  }
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn()
  }
}));

describe('ApprovalQueue Component', () => {
  const mockOnClose = vi.fn();
  const mockSetPendingLogs = vi.fn();
  const pendingLogs = [
    {
      id: '1',
      action: 'Test Action',
      timestamp: '2023-01-01T00:00:00Z',
      tool_called: JSON.stringify({ description: 'A test description', target: 'test-target' })
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when not open', () => {
    render(<ApprovalQueue isOpen={false} onClose={mockOnClose} pendingLogs={pendingLogs} setPendingLogs={mockSetPendingLogs} />);
    expect(screen.queryByText('Approval Queue')).not.toBeInTheDocument();
  });

  it('renders queue items when open', () => {
    render(<ApprovalQueue isOpen={true} onClose={mockOnClose} pendingLogs={pendingLogs} setPendingLogs={mockSetPendingLogs} />);
    expect(screen.getByText('Approval Queue')).toBeInTheDocument();
    expect(screen.getByText('Test Action')).toBeInTheDocument();
    expect(screen.getByText('A test description')).toBeInTheDocument();
  });

  it('handles approve action correctly', async () => {
    render(<ApprovalQueue isOpen={true} onClose={mockOnClose} pendingLogs={pendingLogs} setPendingLogs={mockSetPendingLogs} />);

    const approveButton = screen.getByText('Approve');
    fireEvent.click(approveButton);

    await waitFor(() => {
        expect(supabase.from).toHaveBeenCalledWith('hitl_audit_logs');
    });
  });

  it('handles reject action correctly', async () => {
    render(<ApprovalQueue isOpen={true} onClose={mockOnClose} pendingLogs={pendingLogs} setPendingLogs={mockSetPendingLogs} />);

    const rejectButton = screen.getByText('Reject');
    fireEvent.click(rejectButton);

    await waitFor(() => {
        expect(supabase.from).toHaveBeenCalledWith('hitl_audit_logs');
    });
  });
});
