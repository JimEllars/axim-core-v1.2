import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
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

describe('WorkflowExecutionLog', () => {
  it('renders loading state initially', async () => {
    supabaseApiService.getWorkflowExecutions.mockResolvedValue([]);
    await act(async () => {
        render(<WorkflowExecutionLog />);
    });
    expect(screen.getByText(/Workflow Execution Log/i)).toBeInTheDocument();
  });
});
