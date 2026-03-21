import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import RecentWorkflows from './RecentWorkflows';
import { supabase } from '../../services/supabaseClient';
import { DashboardProvider } from '../../contexts/DashboardContext';

// Mock dependencies
vi.mock('../../services/supabaseClient');

const renderWithProvider = (component) => {
  return render(<DashboardProvider>{component}</DashboardProvider>);
};

const mockWorkflows = [
  {
    created_at: new Date().toISOString(),
    data: {
      workflow_name: 'Successful Workflow',
      results: [{ success: true }, { success: true }],
    },
  },
  {
    created_at: new Date().toISOString(),
    data: {
      workflow_name: 'Failed Workflow',
      results: [{ success: true }, { success: false }],
    },
  },
];

describe('RecentWorkflows Widget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a loading state initially', () => {
    supabase.rpc.mockReturnValue(new Promise(() => {})); // Never resolves
    renderWithProvider(<RecentWorkflows />);
    expect(screen.getByText('Loading workflows...')).toBeInTheDocument();
  });

  it('shows an empty state when no workflows are returned', async () => {
    supabase.rpc.mockResolvedValue({ data: [], error: null });
    renderWithProvider(<RecentWorkflows />);
    await waitFor(() => {
      expect(screen.getByText('No recent workflow executions found.')).toBeInTheDocument();
    });
  });

  it('renders a list of recent workflows', async () => {
    supabase.rpc.mockResolvedValue({ data: mockWorkflows, error: null });
    renderWithProvider(<RecentWorkflows />);
    await waitFor(() => {
      expect(screen.getByText('Successful Workflow')).toBeInTheDocument();
      expect(screen.getByText('Failed Workflow')).toBeInTheDocument();
    });
  });

  it('displays the correct status for successful and failed workflows', async () => {
    supabase.rpc.mockResolvedValue({ data: mockWorkflows, error: null });
    renderWithProvider(<RecentWorkflows />);

    await waitFor(() => {
      const workflowItems = screen.getAllByTestId('workflow-item');

      const successfulWorkflow = workflowItems[0];
      expect(within(successfulWorkflow).getByText('2/2 Steps')).toBeInTheDocument();
      expect(within(successfulWorkflow).getByTestId('success-icon')).toBeInTheDocument();

      const failedWorkflow = workflowItems[1];
      expect(within(failedWorkflow).getByText('1/2 Steps')).toBeInTheDocument();
      expect(within(failedWorkflow).getByTestId('failure-icon')).toBeInTheDocument();
    });
  });
});