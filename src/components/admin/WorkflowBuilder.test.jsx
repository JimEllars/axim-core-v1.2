import { sanitizePayload } from '../../utils/sanitization';
vi.mock('../../utils/sanitization', () => ({
  sanitizePayload: vi.fn((data) => data)
}));
import React from 'react';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import WorkflowBuilder from './WorkflowBuilder';
import supabaseApiService from '../../services/supabaseApiService';
import * as AuthContext from '../../contexts/AuthContext';
import toast from 'react-hot-toast';

vi.mock('@xyflow/react', () => ({
  ReactFlow: () => <div data-testid="react-flow">ReactFlow Mock</div>,
  MiniMap: () => null,
  Controls: () => null,
  Background: () => null,
  useNodesState: (init) => [init, vi.fn()],
  useEdgesState: (init) => [init, vi.fn()],
  addEdge: vi.fn(),
  Handle: () => null,
  Position: { Top: 'top', Bottom: 'bottom' },
  Panel: ({children}) => <div>{children}</div>
}));

vi.mock('../../services/supabaseApiService', () => ({
  default: {
    supabase: { from: vi.fn() },
    getWorkflows: vi.fn(),
    saveWorkflow: vi.fn()
  },
  supabaseApiService: {
    supabase: { from: vi.fn() },
    getWorkflows: vi.fn(),
    saveWorkflow: vi.fn()
  }
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: vi.fn()
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn().mockReturnValue('loading-toast'),
    dismiss: vi.fn()
  }
}));

describe('WorkflowBuilder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    AuthContext.useAuth.mockReturnValue({ user: { id: 'user-123' } });
  });

  it('should load workflows on mount', async () => {
    supabaseApiService.getWorkflows.mockResolvedValue([
      { id: 'wf1', name: 'Test Flow', description: 'desc', definition: { nodes: [], edges: [] } }
    ]);

    render(<WorkflowBuilder />);

    await waitFor(() => {
      expect(supabaseApiService.getWorkflows).toHaveBeenCalledWith('user-123');
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Templates'));
    });

    await waitFor(() => {
      expect(screen.getByText('Test Flow')).toBeInTheDocument();
    });
  });

  it('should handle saving workflow successfully', async () => {
    supabaseApiService.saveWorkflow.mockResolvedValue({ id: 'wf_new' });

    render(<WorkflowBuilder />);

    const saveButton = screen.getByRole('button', { name: /save workflow/i });

    await act(async () => {
      saveButton.click();
    });

    await waitFor(() => {
      expect(supabaseApiService.saveWorkflow).toHaveBeenCalled();
      expect(toast.success).toHaveBeenCalledWith('Workflow saved successfully');
    });
  });

  it('should handle save error', async () => {
    supabaseApiService.saveWorkflow.mockRejectedValue(new Error('Save failed'));

    render(<WorkflowBuilder />);

    const saveButton = screen.getByRole('button', { name: /save workflow/i });

    await act(async () => {
      saveButton.click();
    });

    await waitFor(() => {
      expect(supabaseApiService.saveWorkflow).toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalledWith('Failed to save workflow.');
    });
  });
});
