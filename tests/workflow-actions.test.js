/**
 * Proving tests for supabase/functions/_shared/workflowActions.ts
 *
 * Before this change every `action` node in the DAG runner resolved to
 * `{ message: `Action ${label} executed` }` - a fabricated success with no work
 * done, for every node type. These tests pin real dispatch: outbound HTTP with
 * an SSRF guard, transactional email, and the three robotics actions against
 * their actual tables.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  DEFAULT_HTTP_TIMEOUT_MS,
  SUPPORTED_ACTION_TYPES,
  deriveExecutionStatus,
  executeActionNode,
  resolveActionType,
} from '../supabase/functions/_shared/workflowActions.ts';

const NOW = 1_800_000_000_000;

/**
 * Minimal Postgrest-shaped stub covering only the chains the module uses:
 *   insert().select().single()
 *   select().eq().order().limit()
 *   update().in()
 */
function makeSupabase({ insertResult, selectRows = [], updateError = null } = {}) {
  const calls = [];

  const supabase = {
    from(table) {
      const api = {
        insert(values) {
          calls.push({ op: 'insert', table, values });
          const result = insertResult ?? {
            data: { id: `${table}-row-id`, ...values },
            error: null,
          };
          return {
            select: () => ({ single: async () => result }),
          };
        },
        select(columns) {
          calls.push({ op: 'select', table, columns });
          const chain = {
            eq: (column, value) => {
              calls.push({ op: 'eq', table, column, value });
              return chain;
            },
            order: () => chain,
            limit: async () => ({ data: selectRows, error: null }),
          };
          return chain;
        },
        update(values) {
          calls.push({ op: 'update', table, values });
          return {
            in: async (column, list) => {
              calls.push({ op: 'in', table, column, list });
              return { data: null, error: updateError };
            },
          };
        },
      };
      return api;
    },
  };

  return { supabase, calls };
}

function makeDeps(overrides = {}) {
  const { supabase, calls } = makeSupabase(overrides.supabaseOptions);
  return {
    deps: {
      supabase,
      supabaseUrl: 'https://project.supabase.co',
      assertPublicUrl: vi.fn(async () => {}),
      fetchImpl: vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => '{"ok":true}',
      })),
      sendEmail: vi.fn(async () => ({ success: true, messageId: 'msg-1' })),
      now: () => NOW,
      ...overrides.deps,
    },
    calls,
  };
}

const node = (actionType, config) => ({
  id: 'node-1',
  type: 'action',
  data: { label: 'Test Action', actionType, config },
});

describe('workflow actions: action type resolution', () => {
  it('resolves data.actionType written by the builder', () => {
    expect(resolveActionType({ data: { actionType: 'api_call', config: {} } })).toBe('api_call');
  });

  it('falls back to config.type for hand-authored definitions', () => {
    expect(resolveActionType({ data: { config: { type: 'email' } } })).toBe('email');
  });

  it('returns null for an action node with no type', () => {
    expect(resolveActionType({ data: { label: 'New Action' } })).toBeNull();
  });

  it('covers exactly the documented action types', () => {
    expect([...SUPPORTED_ACTION_TYPES]).toEqual([
      'api_call',
      'email',
      'robot_sim_run',
      'robot_policy_gate',
      'robot_ota_deploy',
    ]);
  });
});

describe('workflow actions: api_call', () => {
  it('runs the SSRF guard before any request is issued', async () => {
    const { deps } = makeDeps();
    deps.assertPublicUrl = vi.fn(async (url) => {
      throw new Error(`SSRF blocked: ${url}`);
    });

    await expect(
      executeActionNode(
        node('api_call', { url: 'http://169.254.169.254/latest/meta-data', method: 'GET' }),
        {},
        deps,
      ),
    ).rejects.toThrow(/SSRF blocked/);

    expect(deps.fetchImpl).not.toHaveBeenCalled();
  });

  it('POSTs the configured payload and reports the real status', async () => {
    const { deps } = makeDeps();
    let clock = NOW;
    deps.now = () => (clock += 25);

    const result = await executeActionNode(
      node('api_call', {
        url: 'https://hooks.example.com/lead',
        method: 'post',
        headers: { 'X-Signature': 'abc' },
        payload: { lead_id: 'l-1' },
      }),
      { workflowRunId: 'wf_run_1' },
      deps,
    );

    expect(deps.assertPublicUrl).toHaveBeenCalledWith('https://hooks.example.com/lead');
    expect(deps.fetchImpl).toHaveBeenCalledOnce();

    const [url, init] = deps.fetchImpl.mock.calls[0];
    expect(url).toBe('https://hooks.example.com/lead');
    expect(init.method).toBe('POST');
    expect(init.headers['X-Signature']).toBe('abc');
    expect(JSON.parse(init.body)).toEqual({ lead_id: 'l-1' });

    expect(result.data).toMatchObject({ status: 200, workflowRunId: 'wf_run_1' });
  });

  it('throws (so the run aborts) on a non-2xx response', async () => {
    const { deps } = makeDeps();
    deps.fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 503,
      text: async () => 'unavailable',
    }));

    await expect(
      executeActionNode(node('api_call', { url: 'https://hooks.example.com/x' }), {}, deps),
    ).rejects.toThrow(/HTTP 503/);
  });

  it('requires config.url', async () => {
    const { deps } = makeDeps();
    await expect(executeActionNode(node('api_call', { method: 'GET' }), {}, deps)).rejects.toThrow(
      /config\.url/,
    );
  });

  it('exposes a bounded default timeout', () => {
    expect(DEFAULT_HTTP_TIMEOUT_MS).toBe(10_000);
  });
});

describe('workflow actions: email', () => {
  it('dispatches through the injected EmailDispatchManager wrapper', async () => {
    const { deps } = makeDeps();

    const result = await executeActionNode(
      node('email', { to: 'lead@example.com', subject: 'Welcome', body: '<p>hi</p>' }),
      { workflowRunId: 'wf_run_1' },
      deps,
    );

    expect(deps.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'lead@example.com', subject: 'Welcome', html: '<p>hi</p>' }),
    );
    expect(result.message).toMatch(/Email sent to lead@example\.com/);
    expect(result.data).toMatchObject({ messageId: 'msg-1' });
  });

  it('rejects a node with no recipient', async () => {
    const { deps } = makeDeps();
    await expect(
      executeActionNode(node('email', { subject: 'x' }), {}, deps),
    ).rejects.toThrow(/config\.to/);
  });

  it('throws when the provider reports failure', async () => {
    const { deps } = makeDeps();
    deps.sendEmail = vi.fn(async () => ({ success: false }));

    await expect(
      executeActionNode(node('email', { to: 'lead@example.com' }), {}, deps),
    ).rejects.toThrow(/Email dispatch failed/);
  });
});

describe('workflow actions: robot_sim_run', () => {
  it('queues a simulation run row and returns its id', async () => {
    const { deps, calls } = makeDeps({
      supabaseOptions: {
        insertResult: { data: { id: 'sim-123' }, error: null },
      },
    });

    const result = await executeActionNode(
      node('robot_sim_run', { project_id: 'proj-1', scene_type: 'warehouse', duration_sec: 45 }),
      { workflowRunId: 'wf_run_9' },
      deps,
    );

    const insert = calls.find((call) => call.op === 'insert');
    expect(insert.table).toBe('robot_simulation_runs');
    expect(insert.values).toMatchObject({
      project_id: 'proj-1',
      scene_type: 'warehouse',
      duration_sec: 45,
      status: 'queued',
      workflow_run_id: 'wf_run_9',
    });
    expect(result.data).toMatchObject({ sim_id: 'sim-123', exit_state: 'queued' });
  });

  it('rejects a non-positive duration', async () => {
    const { deps } = makeDeps();
    await expect(
      executeActionNode(
        node('robot_sim_run', { project_id: 'proj-1', duration_sec: 0 }),
        {},
        deps,
      ),
    ).rejects.toThrow(/duration_sec/);
  });

  it('surfaces a database error instead of reporting success', async () => {
    const { deps } = makeDeps({
      supabaseOptions: {
        insertResult: { data: null, error: { message: 'insert failed' } },
      },
    });

    await expect(
      executeActionNode(
        node('robot_sim_run', { project_id: 'proj-1', duration_sec: 10 }),
        {},
        deps,
      ),
    ).rejects.toThrow(/insert failed/);
  });
});

describe('workflow actions: robot_policy_gate', () => {
  it('passes when the newest policy clears the threshold', async () => {
    const { deps } = makeDeps({
      supabaseOptions: {
        selectRows: [{ id: 'pol-1', version: 'v1.4.0', benchmark_score: 0.93, status: 'evaluating' }],
      },
    });

    const result = await executeActionNode(
      node('robot_policy_gate', { project_id: 'proj-1', min_benchmark_score: 0.9 }),
      {},
      deps,
    );

    expect(result.data).toMatchObject({ passed: true, score: 0.93, policy_id: 'pol-1' });
  });

  it('fails the node when the policy scores below the threshold', async () => {
    const { deps } = makeDeps({
      supabaseOptions: {
        selectRows: [{ id: 'pol-1', version: 'v1.3.0', benchmark_score: 0.71 }],
      },
    });

    await expect(
      executeActionNode(node('robot_policy_gate', { project_id: 'proj-1', min_benchmark_score: 0.9 }), {}, deps),
    ).rejects.toThrow(/threshold 0\.9/);
  });

  it('fails closed when no policy is registered', async () => {
    const { deps } = makeDeps({ supabaseOptions: { selectRows: [] } });

    await expect(
      executeActionNode(node('robot_policy_gate', { project_id: 'proj-1' }), {}, deps),
    ).rejects.toThrow(/No policy registered/);
  });
});

describe('workflow actions: robot_ota_deploy', () => {
  it('registers the package and moves the target nodes to the new version', async () => {
    const { deps, calls } = makeDeps({
      supabaseOptions: {
        insertResult: { data: { id: 'pol-new' }, error: null },
      },
    });

    const result = await executeActionNode(
      node('robot_ota_deploy', {
        project_id: 'proj-1',
        version: 'v2.0.0',
        node_ids: ['node-a', 'node-b'],
      }),
      { workflowRunId: 'wf_run_3' },
      deps,
    );

    const insert = calls.find((call) => call.op === 'insert');
    expect(insert.table).toBe('robot_policy_registry');
    expect(insert.values).toMatchObject({ project_id: 'proj-1', version: 'v2.0.0', status: 'approved' });

    const update = calls.find((call) => call.op === 'update');
    expect(update.table).toBe('robot_fleet_nodes');
    expect(update.values).toEqual({ firmware_version: 'v2.0.0' });

    const dispatched = calls.find((call) => call.op === 'in');
    expect(dispatched.table).toBe('robot_fleet_nodes');
    expect(dispatched.column).toBe('id');
    expect(dispatched.list).toEqual(['node-a', 'node-b']);

    expect(result.data).toMatchObject({ status: 'deployed', dispatched_nodes: 2, policy_id: 'pol-new' });
  });

  it('still registers the package when no fleet nodes are targeted', async () => {
    const { deps, calls } = makeDeps();

    const result = await executeActionNode(
      node('robot_ota_deploy', { project_id: 'proj-1', version: 'v2.0.1' }),
      {},
      deps,
    );

    expect(calls.some((call) => call.op === 'update')).toBe(false);
    expect(result.data).toMatchObject({ dispatched_nodes: 0 });
  });
});

describe('workflow actions: unsupported nodes and status rollup', () => {
  it('throws for an action node with no type instead of faking success', async () => {
    const { deps } = makeDeps();
    await expect(
      executeActionNode({ id: 'x', type: 'action', data: { label: 'Mystery' } }, {}, deps),
    ).rejects.toThrow(/no recognisable action type/);
  });

  it('throws for an unknown action type', async () => {
    const { deps } = makeDeps();
    await expect(
      executeActionNode(node('send_carrier_pigeon', {}), {}, deps),
    ).rejects.toThrow(/Unsupported action type/);
  });

  it('marks an aborted run failed, never completed', () => {
    const ok = { step: 'a', nodeId: 'a', actionType: null, success: true, message: 'ok' };
    expect(deriveExecutionStatus([ok])).toBe('completed');
    expect(deriveExecutionStatus([ok], true)).toBe('failed');
    expect(
      deriveExecutionStatus([ok, { ...ok, success: false }], false),
    ).toBe('failed');
  });
});
