import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import WorkflowNodeInspector from './WorkflowNodeInspector';

vi.mock('../../common/SafeIcon', () => ({
  default: ({ icon, ...props }) => <span data-testid="safe-icon" {...props} />,
}));

const UUID = '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';

const actionNode = (data = {}, overrides = {}) => ({
  id: 'node_1',
  type: 'action',
  position: { x: 0, y: 0 },
  data: { label: 'Notify CRM', ...data },
  ...overrides,
});

describe('WorkflowNodeInspector', () => {
  let onChange;
  let onDelete;
  let onClose;

  beforeEach(() => {
    onChange = vi.fn();
    onDelete = vi.fn();
    onClose = vi.fn();
  });

  const renderInspector = (node) =>
    render(<WorkflowNodeInspector node={node} onChange={onChange} onDelete={onDelete} onClose={onClose} />);

  it('renders nothing when no node is selected', () => {
    const { container } = renderInspector(null);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the node type and id', () => {
    renderInspector(actionNode({ actionType: 'api_call', config: { url: 'https://x.example.com' } }));
    expect(screen.getByRole('complementary', { name: /node configuration/i })).toBeInTheDocument();
    expect(screen.getByText('node_1')).toBeInTheDocument();
  });

  it('renames the step', () => {
    renderInspector(actionNode({ actionType: 'api_call' }));
    fireEvent.change(screen.getByLabelText(/step name/i), { target: { value: 'Push to CRM' } });
    expect(onChange).toHaveBeenCalledWith('node_1', { label: 'Push to CRM' });
  });

  it('explains trigger nodes instead of rendering an action form', () => {
    renderInspector({ id: 't1', type: 'trigger', data: { label: 'Webhook' } });
    expect(screen.getByText(/trigger nodes start the run/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/action type/i)).not.toBeInTheDocument();
  });

  it('explains condition nodes', () => {
    renderInspector({ id: 'c1', type: 'condition', data: { label: 'Score > 80' } });
    expect(screen.getByText(/evaluated inline by the runner/i)).toBeInTheDocument();
  });

  it('renders the field set for the selected action type', () => {
    renderInspector(
      actionNode({ actionType: 'robot_sim_run', config: { project_id: UUID, duration_sec: 60 } }),
    );
    expect(screen.queryByLabelText(/endpoint url/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/robotics project id/i)).toHaveValue(UUID);
    expect(screen.getByLabelText(/duration \(seconds\)/i)).toHaveValue(60);
    expect(screen.getByLabelText(/scene/i)).toBeInTheDocument();
  });

  it('switches action type, seeding defaults and dropping foreign config', () => {
    renderInspector(
      actionNode({ actionType: 'api_call', config: { url: 'https://hooks.example.com/x' } }),
    );
    fireEvent.change(screen.getByLabelText(/action type/i), { target: { value: 'robot_policy_gate' } });

    const patch = onChange.mock.calls.at(-1)[1];
    expect(patch.actionType).toBe('robot_policy_gate');
    expect(patch.config).toEqual({ min_benchmark_score: 0.8 });
  });

  it('asks the runner-facing question when no action type is chosen', () => {
    renderInspector(actionNode({ config: {} }));
    expect(screen.getByText(/runner rejects untyped action nodes/i)).toBeInTheDocument();
  });

  it('commits a URL edit into config', () => {
    renderInspector(actionNode({ actionType: 'api_call', config: {} }));
    fireEvent.change(screen.getByLabelText(/endpoint url/i), {
      target: { value: 'https://hooks.example.com/lead' },
    });
    expect(onChange).toHaveBeenCalledWith('node_1', {
      config: { url: 'https://hooks.example.com/lead' },
    });
  });

  it('clears a config key when its field is emptied', () => {
    renderInspector(actionNode({ actionType: 'api_call', config: { url: 'https://a.example.com' } }));
    fireEvent.change(screen.getByLabelText(/endpoint url/i), { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith('node_1', { config: {} });
  });

  it('reports a missing required field and blocks the ready state', () => {
    renderInspector(actionNode({ actionType: 'api_call', config: {} }));
    expect(screen.getByText(/Endpoint URL is required/i)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/halts the DAG on this node/i);
  });

  it('shows the ready state for a complete config', () => {
    renderInspector(
      actionNode({
        actionType: 'api_call',
        config: { url: 'https://hooks.example.com/lead', method: 'POST' },
      }),
    );
    expect(screen.getByRole('status')).toHaveTextContent(/Ready to run as API Call/i);
  });

  it('stores recipients as a string when there is one and an array when there are several', () => {
    renderInspector(actionNode({ actionType: 'email', config: {} }));

    fireEvent.change(screen.getByLabelText(/recipients/i), {
      target: { value: 'ops@example.com' },
    });
    expect(onChange.mock.calls.at(-1)[1].config.to).toBe('ops@example.com');

    fireEvent.change(screen.getByLabelText(/recipients/i), {
      target: { value: 'ops@example.com, cfo@example.com' },
    });
    expect(onChange.mock.calls.at(-1)[1].config.to).toEqual(['ops@example.com', 'cfo@example.com']);
  });

  it('always stores fleet node ids as an array so the runner does not drop them', () => {
    renderInspector(actionNode({ actionType: 'robot_ota_deploy', config: { version: '1.0.0' } }));
    fireEvent.change(screen.getByLabelText(/target fleet nodes/i), { target: { value: UUID } });
    expect(onChange.mock.calls.at(-1)[1].config.node_ids).toEqual([UUID]);
  });

  it('buffers JSON text and commits only once it parses', () => {
    renderInspector(actionNode({ actionType: 'api_call', config: { url: 'https://a.example.com' } }));
    const headers = screen.getByLabelText(/headers/i);

    fireEvent.change(headers, { target: { value: '{"X-Source":' } });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText(/Invalid JSON/i)).toBeInTheDocument();

    fireEvent.change(headers, { target: { value: '{"X-Source":"axim"}' } });
    expect(onChange.mock.calls.at(-1)[1].config).toEqual({
      url: 'https://a.example.com',
      headers: { 'X-Source': 'axim' },
    });
    expect(screen.queryByText(/Invalid JSON/i)).not.toBeInTheDocument();
  });

  it('seeds the JSON editor from the stored config', () => {
    renderInspector(
      actionNode({
        actionType: 'api_call',
        config: { url: 'https://a.example.com', body: { lead_id: 'abc' } },
      }),
    );
    expect(screen.getByLabelText(/request body/i).value).toContain('"lead_id": "abc"');
  });

  it('commits numeric fields as numbers', () => {
    renderInspector(actionNode({ actionType: 'api_call', config: { url: 'https://a.example.com' } }));
    fireEvent.change(screen.getByLabelText(/timeout \(ms\)/i), { target: { value: '2500' } });
    expect(onChange.mock.calls.at(-1)[1].config.timeout_ms).toBe(2500);
  });

  it('flags an out-of-range number', () => {
    renderInspector(
      actionNode({ actionType: 'robot_policy_gate', config: { project_id: UUID, min_benchmark_score: 1.5 } }),
    );
    expect(screen.getByText(/must be at most 1/i)).toBeInTheDocument();
  });

  it('surfaces the runner error for a mistyped uuid', () => {
    renderInspector(actionNode({ actionType: 'robot_sim_run', config: { project_id: 'project-1', duration_sec: 30 } }));
    expect(screen.getByText(/Robotics Project ID must be a UUID/i)).toBeInTheDocument();
  });

  it('deletes the selected step', () => {
    renderInspector(actionNode({ actionType: 'api_call' }));
    fireEvent.click(screen.getByRole('button', { name: /delete step/i }));
    expect(onDelete).toHaveBeenCalledWith('node_1');
  });

  it('closes the panel', () => {
    renderInspector(actionNode({ actionType: 'api_call' }));
    fireEvent.click(screen.getByRole('button', { name: /close node configuration/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('resets the JSON buffer when a different node is selected', () => {
    const { rerender } = render(
      <WorkflowNodeInspector
        node={actionNode({ actionType: 'api_call', config: { url: 'https://a.example.com', body: { a: 1 } } })}
        onChange={onChange}
      />,
    );
    const headers = screen.getByLabelText(/request body/i);
    fireEvent.change(headers, { target: { value: '{"typing":' } });
    expect(screen.getByText(/Invalid JSON/i)).toBeInTheDocument();

    act(() => {
      rerender(
        <WorkflowNodeInspector
          node={{
            id: 'node_2',
            type: 'action',
            data: { label: 'Second', actionType: 'api_call', config: { url: 'https://b.example.com', body: { b: 2 } } },
          }}
          onChange={onChange}
        />,
      );
    });

    expect(screen.queryByText(/Invalid JSON/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/request body/i).value).toContain('"b": 2');
  });
});
