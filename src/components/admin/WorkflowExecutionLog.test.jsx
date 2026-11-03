import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import WorkflowExecutionLog from './WorkflowExecutionLog';
import supabaseApiService from '../../services/supabaseApiService';

vi.mock('../../services/supabaseApiService', () => ({
  default: {
    getWorkflowExecutions: vi.fn()
  },
  supabaseApiService: {
      getWorkflowExecutions: vi.fn()
  }
}));

vi.mock('../../common/SafeIcon', () => ({
  default: ({ icon, ...props }) => <span data-testid="safe-icon" {...props} />,
}));

const completedRun = {
  id: 'log-1',
  workflow_name: 'Lead Orchestration',
  workflow_run_id: 'wf_run_abc12345',
  status: 'completed',
  error_message: null,
  node_results: [{ success: true }, { success: true }],
  steps_total: 2,
  steps_succeeded: 2,
  duration_ms: 1450,
  created_at: '2026-11-01T12:00:00.000Z',
  source: 'workflow_execution_logs',
};

const failedRun = {
  id: 'log-2',
  workflow_name: 'Robotics OTA',
  workflow_run_id: 'wf_run_def67890',
  status: 'failed',
  error_message: 'Node "Deploy" is missing required config.version',
  node_results: [{ success: true }, { success: false }],
  steps_total: 2,
  steps_succeeded: 1,
  duration_ms: 320,
  created_at: '2026-11-01T13:00:00.000Z',
  source: 'workflow_execution_logs',
};

const renderLog = async () => {
  await act(async () => {
    render(<WorkflowExecutionLog />);
  });
};

describe('WorkflowExecutionLog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', async () => {
    supabaseApiService.getWorkflowExecutions.mockResolvedValue([]);
    await renderLog();
    expect(screen.getByText(/Workflow Execution Log/i)).toBeInTheDocument();
  });

  it('shows an empty state when there is no history', async () => {
    supabaseApiService.getWorkflowExecutions.mockResolvedValue([]);
    await renderLog();
    expect(screen.getByText(/No workflow executions match/i)).toBeInTheDocument();
  });

  it('renders the persisted run status, duration and step counts', async () => {
    supabaseApiService.getWorkflowExecutions.mockResolvedValue([completedRun]);
    await renderLog();

    expect(screen.getByText('Lead Orchestration')).toBeInTheDocument();
    expect(screen.getByText('SUCCESS')).toBeInTheDocument();
    expect(screen.getByText('1.5s')).toBeInTheDocument();
    expect(screen.getByText('2/2 steps succeeded')).toBeInTheDocument();
    expect(screen.getByText('wf_run_a')).toBeInTheDocument();
  });

  it('surfaces the error_message that aborted a failed run', async () => {
    supabaseApiService.getWorkflowExecutions.mockResolvedValue([failedRun]);
    await renderLog();

    expect(screen.getByText('FAILED')).toBeInTheDocument();
    expect(
      screen.getByText('Node "Deploy" is missing required config.version'),
    ).toBeInTheDocument();
    expect(screen.getByText('320ms')).toBeInTheDocument();
  });

  it('filters to failed runs only', async () => {
    supabaseApiService.getWorkflowExecutions.mockResolvedValue([completedRun, failedRun]);
    await renderLog();

    await act(async () => {
      fireEvent.change(screen.getByLabelText(/filter by status/i), { target: { value: 'ERROR' } });
    });

    expect(screen.getByText('Robotics OTA')).toBeInTheDocument();
    expect(screen.queryByText('Lead Orchestration')).not.toBeInTheDocument();
  });

  it('labels legacy event rows as unknown rather than successful', async () => {
    supabaseApiService.getWorkflowExecutions.mockResolvedValue([
      {
        id: 'ev-1',
        workflow_name: 'Legacy Run',
        workflow_run_id: null,
        status: 'unknown',
        error_message: null,
        node_results: [],
        steps_total: 0,
        steps_succeeded: 0,
        duration_ms: null,
        created_at: '2026-10-01T00:00:00.000Z',
        source: 'events_ax2024',
      },
    ]);
    await renderLog();

    expect(screen.getByText('UNKNOWN')).toBeInTheDocument();
    expect(screen.getByText(/Legacy event with no step detail/i)).toBeInTheDocument();
  });
});
