import '@testing-library/jest-dom';
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
  // Stateful stand-ins so node edits actually round-trip through
  // setNodes() the way they do on the real canvas.
  ReactFlow: ({ nodes, onNodeClick, onPaneClick }) => (
    <div data-testid="react-flow">
      {(nodes || []).map((node) => (
        <button
          key={node.id}
          type="button"
          data-testid={`canvas-node-${node.id}`}
          onClick={() => onNodeClick?.({}, node)}
        >
          {node.data?.label}
        </button>
      ))}
      <button type="button" data-testid="canvas-pane" onClick={() => onPaneClick?.()}>
        pane
      </button>
    </div>
  ),
  MiniMap: () => null,
  Controls: () => null,
  Background: () => null,
  useNodesState: (init) => {
    const [state, setState] = React.useState(init);
    return [state, setState, vi.fn()];
  },
  useEdgesState: (init) => {
    const [state, setState] = React.useState(init);
    return [state, setState, vi.fn()];
  },
  addEdge: vi.fn(),
  Handle: () => null,
  Position: { Top: 'top', Bottom: 'bottom' },
  Panel: ({children}) => <div>{children}</div>
}));

vi.mock('../../services/supabaseApiService', () => ({
  default: {
    supabase: { from: vi.fn(), functions: { invoke: vi.fn() } },
    getWorkflows: vi.fn(),
    saveWorkflow: vi.fn()
  },
  supabaseApiService: {
    supabase: { from: vi.fn(), functions: { invoke: vi.fn() } },
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

  describe('action node configuration', () => {
    it('opens the inspector for the clicked step', async () => {
      render(<WorkflowBuilder />);

      await act(async () => {
        screen.getByTestId('canvas-node-2').click();
      });

      expect(screen.getByRole('complementary', { name: /node configuration/i })).toBeInTheDocument();
      // The default action step is seeded as an api_call, so the inspector
      // opens on that action type's field set.
      expect(screen.getByLabelText(/action type/i)).toHaveValue('api_call');
      expect(screen.getByLabelText(/endpoint url/i)).toBeInTheDocument();
    });

    it('closes the inspector when the canvas background is clicked', async () => {
      render(<WorkflowBuilder />);

      await act(async () => {
        screen.getByTestId('canvas-node-2').click();
      });
      expect(screen.getByLabelText(/endpoint url/i)).toBeInTheDocument();

      await act(async () => {
        screen.getByTestId('canvas-pane').click();
      });

      expect(screen.queryByLabelText(/endpoint url/i)).not.toBeInTheDocument();
      expect(screen.getByText(/select a step on the canvas/i)).toBeInTheDocument();
    });

    it('persists authored action config through the saved definition', async () => {
      supabaseApiService.saveWorkflow.mockImplementation(async (workflow) => ({ id: 'wf1', ...workflow }));

      render(<WorkflowBuilder />);

      await act(async () => {
        screen.getByTestId('canvas-node-2').click();
      });

      await act(async () => {
        fireEvent.change(screen.getByLabelText(/endpoint url/i), {
          target: { value: 'https://hooks.example.com/lead' },
        });
      });

      await act(async () => {
        screen.getByRole('button', { name: /save workflow/i }).click();
      });

      await waitFor(() => expect(supabaseApiService.saveWorkflow).toHaveBeenCalled());

      const [savedWorkflow] = supabaseApiService.saveWorkflow.mock.calls.at(-1);
      const savedActionNode = savedWorkflow.definition.nodes.find((node) => node.id === '2');
      expect(savedActionNode.data.actionType).toBe('api_call');
      expect(savedActionNode.data.config.url).toBe('https://hooks.example.com/lead');
    });

    it('refuses to dispatch a graph with an unconfigured action step', async () => {
      render(<WorkflowBuilder />);

      await act(async () => {
        screen.getByRole('button', { name: /run workflow/i }).click();
      });

      expect(supabaseApiService.supabase.functions.invoke).not.toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalledWith('"Format Payload": Endpoint URL is required.');
      // The offending step is selected so the operator lands on the fix.
      expect(screen.getByLabelText(/endpoint url/i)).toBeInTheDocument();
    });

    it('dispatches once every action step is configured', async () => {
      supabaseApiService.supabase.functions.invoke.mockResolvedValue({ data: { ok: true } });

      render(<WorkflowBuilder />);

      await act(async () => {
        screen.getByTestId('canvas-node-2').click();
      });
      await act(async () => {
        fireEvent.change(screen.getByLabelText(/endpoint url/i), {
          target: { value: 'https://hooks.example.com/lead' },
        });
      });

      await act(async () => {
        screen.getByRole('button', { name: /run workflow/i }).click();
      });

      await waitFor(() => {
        expect(supabaseApiService.supabase.functions.invoke).toHaveBeenCalledWith(
          'trigger-workflow',
          expect.objectContaining({
            body: expect.objectContaining({ context: { source: 'workflow_builder_ui' } }),
          }),
        );
      });
      expect(toast.success).toHaveBeenCalledWith('Workflow test run initiated');
    });

    it('deletes the selected step and its edges', async () => {
      render(<WorkflowBuilder />);

      await act(async () => {
        screen.getByTestId('canvas-node-2').click();
      });
      await act(async () => {
        screen.getByRole('button', { name: /delete step/i }).click();
      });

      expect(screen.queryByTestId('canvas-node-2')).not.toBeInTheDocument();
      expect(screen.getByText(/select a step on the canvas/i)).toBeInTheDocument();
    });
  });
});
