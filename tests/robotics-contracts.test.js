// @vitest-environment node
/**
 * Proving tests for `supabase/functions/_shared/robotics.ts`.
 *
 * What these exist to pin down:
 *
 *   - The edge worker has routed `/api/v1/robotics/*` at functions that did not
 *     exist, and `robot_sim_run` action nodes queued rows into
 *     `robot_simulation_runs` that nothing consumed. Both were reported as
 *     working; neither was.
 *   - `drainSimulationQueue` must never claim a run it cannot dispatch. Claiming
 *     and then marking 'failed' would destroy queued work to report a
 *     configuration gap.
 *   - `emergencyStopFleet` must stop nodes *before* it writes the audit row, so
 *     a partial failure leaves robots stopped rather than moving.
 *   - Validation must reject requests that would otherwise surface as a 500
 *     (bad UUID, missing duration, empty stop scope).
 *
 * `robotics.ts` deliberately has no `Deno.*` access, which is why it runs here.
 */
import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_DRAIN_BATCH,
  MAX_DRAIN_BATCH,
  MAX_SIM_DURATION_SEC,
  ROBOT_CLASSES,
  SimulatorNotConfiguredError,
  validateCreateProject,
  validateDrainRequest,
  validateEmergencyStop,
  validateSimRequest,
  createProject,
  drainSimulationQueue,
  emergencyStopFleet,
  listProjects,
  listSimulationRuns,
  projectExists,
  queueSimulationRun,
  simulationQueueStats,
} from '../supabase/functions/_shared/robotics.ts';

const NOW = 1_800_000_000_000;
const PROJECT_ID = '3f0e1d2c-1b2a-4c5d-8e9f-0a1b2c3d4e5f';
const RUN_ID = '9a8b7c6d-5e4f-4a3b-2c1d-0e9f8a7b6c5d';

function isoNow() {
  return new Date(NOW).toISOString();
}

/**
 * Minimal PostgREST stand-in. Every chain is recorded so a test can assert on
 * the SQL shape the operation asked for, not just its return value.
 */
function makeSupabase(overrides = {}) {
  const calls = [];
  const state = {
    rows: [],
    insertResult: { data: { id: 'new-row', ...(overrides.insertValues ?? {}) }, error: null },
    error: null,
    ...overrides,
  };

  const makeChain = (table, op) => {
    const chain = {
      eq(column, value) {
        calls.push({ op, table, method: 'eq', column, value });
        return chain;
      },
      in(column, values) {
        calls.push({ op, table, method: 'in', column, values });
        return chain;
      },
      order(column, options) {
        calls.push({ op, table, method: 'order', column, options });
        return chain;
      },
      limit(count) {
        calls.push({ op, table, method: 'limit', count });
        return Promise.resolve({ data: state.error ? null : state.rows, error: state.error });
      },
      single: async () => state.rows.length === 1
        ? { data: state.rows[0], error: null }
        : { data: null, error: state.error },
      maybeSingle: async () => ({
        data: state.rows.length > 0 ? state.rows[0] : null,
        error: state.error,
      }),
      then(onFulfilled, onRejected) {
        return Promise.resolve({
          data: state.error ? null : state.rows,
          error: state.error,
        }).then(onFulfilled, onRejected);
      },
    };
    return chain;
  };

  const supabase = {
    from(table) {
      return {
        select(columns) {
          calls.push({ op: 'select', table, columns });
          return makeChain(table, 'select');
        },
        insert(values) {
          calls.push({ op: 'insert', table, values });
          const result = overrides.insertResult ?? state.insertResult;
          return {
            select() {
              const inner = {
                single: async () => (Array.isArray(result.data)
                  ? { data: result.data[0], error: result.error }
                  : result),
              };
              inner.then = (onFulfilled, onRejected) =>
                Promise.resolve(result).then(onFulfilled, onRejected);
              return inner;
            },
          };
        },
        update(values) {
          calls.push({ op: 'update', table, values });
          return makeChain(table, 'update');
        },
      };
    },
    rpc(fn, args) {
      calls.push({ op: 'rpc', fn, args });
      return Promise.resolve(overrides.rpcResult ?? { data: [], error: null });
    },
  };

  return { supabase, calls, state };
}

function makeDeps(supabase, extra = {}) {
  return {
    supabase,
    fetchImpl: vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })),
    assertPublicUrl: vi.fn(async () => undefined),
    now: () => NOW,
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe('validateCreateProject', () => {
  it('accepts a minimal payload and defaults target_specs to {}', () => {
    const result = validateCreateProject({ name: 'Ahb1000', robot_class: 'hexapod' });
    expect(result.ok).toBe(true);
    expect(result.value).toEqual({ name: 'Ahb1000', robot_class: 'hexapod', target_specs: {} });
  });

  it('trims the name', () => {
    const result = validateCreateProject({ name: '  Ahb1000  ', robot_class: 'rover' });
    expect(result.value.name).toBe('Ahb1000');
  });

  it('rejects a robot_class outside the Postgres enum', () => {
    const result = validateCreateProject({ name: 'x', robot_class: 'hovercraft' });
    expect(result).toEqual({
      ok: false,
      error: `robot_class must be one of: ${ROBOT_CLASSES.join(', ')}`,
    });
  });

  it('rejects a blank name', () => {
    expect(validateCreateProject({ name: '   ', robot_class: 'arm' }).ok).toBe(false);
  });

  it('rejects target_specs that is not an object', () => {
    expect(
      validateCreateProject({ name: 'x', robot_class: 'arm', target_specs: [1, 2] }).ok,
    ).toBe(false);
  });
});

describe('validateSimRequest', () => {
  it('accepts a valid request and defaults the scene', () => {
    const result = validateSimRequest({ project_id: PROJECT_ID, duration_sec: 30 });
    expect(result.ok).toBe(true);
    expect(result.value).toEqual({
      project_id: PROJECT_ID,
      scene_type: 'default',
      duration_sec: 30,
      params: {},
    });
  });

  it('rounds a fractional duration to an integer', () => {
    const result = validateSimRequest({ project_id: PROJECT_ID, duration_sec: '12.7' });
    expect(result.value.duration_sec).toBe(13);
  });

  // The regression this guards: `Number(undefined)` is NaN but `Number(null)` is
  // 0, and the table's CHECK constraint is `duration_sec > 0`. A missing field
  // must be a 400 here, not a 500 from Postgres.
  it('rejects a missing duration instead of coercing it', () => {
    expect(validateSimRequest({ project_id: PROJECT_ID }).ok).toBe(false);
    expect(validateSimRequest({ project_id: PROJECT_ID, duration_sec: null }).ok).toBe(false);
  });

  it('rejects a non-positive duration', () => {
    expect(validateSimRequest({ project_id: PROJECT_ID, duration_sec: 0 }).ok).toBe(false);
    expect(validateSimRequest({ project_id: PROJECT_ID, duration_sec: -5 }).ok).toBe(false);
  });

  it('rejects a duration beyond the sanity ceiling', () => {
    const result = validateSimRequest({
      project_id: PROJECT_ID,
      duration_sec: MAX_SIM_DURATION_SEC + 1,
    });
    expect(result.ok).toBe(false);
  });

  it('rejects a project_id that is not a UUID', () => {
    expect(validateSimRequest({ project_id: 'not-a-uuid', duration_sec: 5 }).ok).toBe(false);
  });
});

describe('validateEmergencyStop', () => {
  it('accepts a project-scoped stop', () => {
    const result = validateEmergencyStop({ project_id: PROJECT_ID, reason: 'anomaly' });
    expect(result).toEqual({
      ok: true,
      value: { project_id: PROJECT_ID, node_ids: [], reason: 'anomaly' },
    });
  });

  it('accepts a node-scoped stop', () => {
    const result = validateEmergencyStop({ node_ids: ['ahb-01', 'ahb-02'] });
    expect(result.value.node_ids).toEqual(['ahb-01', 'ahb-02']);
  });

  // An empty body must not mean "stop the whole fleet".
  it('refuses a stop with no scope', () => {
    expect(validateEmergencyStop({}).ok).toBe(false);
    expect(validateEmergencyStop({ node_ids: [] }).ok).toBe(false);
    expect(validateEmergencyStop({ reason: 'panic' }).ok).toBe(false);
  });

  it('rejects node_ids containing a blank entry', () => {
    expect(validateEmergencyStop({ node_ids: ['ahb-01', '  '] }).ok).toBe(false);
  });

  it('rejects node_ids that is not an array', () => {
    expect(validateEmergencyStop({ node_ids: 'ahb-01' }).ok).toBe(false);
  });
});

describe('validateDrainRequest', () => {
  it('defaults to the batch size', () => {
    expect(validateDrainRequest({}).value).toEqual({ limit: DEFAULT_DRAIN_BATCH });
  });

  it('clamps to the accepted range', () => {
    expect(validateDrainRequest({ limit: 0 }).ok).toBe(false);
    expect(validateDrainRequest({ limit: MAX_DRAIN_BATCH + 1 }).ok).toBe(false);
    expect(validateDrainRequest({ limit: 'abc' }).ok).toBe(false);
    expect(validateDrainRequest({ limit: 2.5 }).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Projects and runs
// ---------------------------------------------------------------------------

describe('createProject / listProjects', () => {
  it('inserts into robot_projects with status active', async () => {
    const { supabase, calls } = makeSupabase({
      insertResult: { data: { id: 'p1', name: 'Ahb1000' }, error: null },
    });

    const project = await createProject(
      { name: 'Ahb1000', robot_class: 'hexapod', target_specs: {} },
      makeDeps(supabase),
    );

    expect(project.id).toBe('p1');
    expect(calls).toContainEqual({
      op: 'insert',
      table: 'robot_projects',
      values: {
        name: 'Ahb1000',
        robot_class: 'hexapod',
        target_specs: {},
        status: 'active',
      },
    });
  });

  it('throws when Postgres rejects the insert', async () => {
    const { supabase } = makeSupabase({
      insertResult: { data: null, error: { message: 'duplicate key' } },
    });
    await expect(
      createProject(
        { name: 'x', robot_class: 'arm', target_specs: {} },
        makeDeps(supabase),
      ),
    ).rejects.toThrow(/duplicate key/);
  });

  it('filters by id when one is supplied', async () => {
    const { supabase, calls, state } = makeSupabase();
    state.rows = [];

    await listProjects(makeDeps(supabase), { projectId: PROJECT_ID });

    expect(calls).toContainEqual({
      op: 'select',
      table: 'robot_projects',
      method: 'eq',
      column: 'id',
      value: PROJECT_ID,
    });
  });

  it('caps the page size', async () => {
    const { supabase, calls, state } = makeSupabase();
    state.rows = [];

    await listProjects(makeDeps(supabase), { limit: 10_000 });

    const limitCall = calls.find((call) => call.method === 'limit');
    expect(limitCall.count).toBe(200);
  });

  it('projectExists is false for a missing project', async () => {
    const { supabase } = makeSupabase();
    await expect(projectExists(PROJECT_ID, makeDeps(supabase))).resolves.toBe(false);
  });
});

describe('queueSimulationRun / listSimulationRuns', () => {
  it('queues with status queued and carries the workflow run id', async () => {
    const { supabase, calls } = makeSupabase({
      insertResult: { data: { id: RUN_ID, status: 'queued' }, error: null },
    });

    const run = await queueSimulationRun(
      { project_id: PROJECT_ID, scene_type: 'default', duration_sec: 30, params: { a: 1 } },
      makeDeps(supabase),
      { workflowRunId: 'wf-run-1' },
    );

    expect(run.id).toBe(RUN_ID);
    expect(calls).toContainEqual({
      op: 'insert',
      table: 'robot_simulation_runs',
      values: {
        project_id: PROJECT_ID,
        scene_type: 'default',
        duration_sec: 30,
        status: 'queued',
        params: { a: 1 },
        workflow_run_id: 'wf-run-1',
      },
    });
  });

  it('reads claimed_at so an in-flight run is visible', async () => {
    const { supabase, calls, state } = makeSupabase();
    state.rows = [];

    await listSimulationRuns(makeDeps(supabase), { projectId: PROJECT_ID });

    const select = calls.find((call) => call.op === 'select');
    expect(select.columns).toContain('claimed_at');
    expect(select.columns).toContain('exit_state');
  });
});

// ---------------------------------------------------------------------------
// Emergency stop
// ---------------------------------------------------------------------------

function fleetSupabase({ matchedIds = ['ahb-01'], faultError = null } = {}) {
  const calls = [];
  const supabase = {
    from(table) {
      return {
        update(values) {
          calls.push({ op: 'update', table, values });
          const chain = {
            eq(column, value) {
              calls.push({ op: 'eq', table, column, value });
              return chain;
            },
            in(column, values2) {
              calls.push({ op: 'in', table, column, values: values2 });
              return chain;
            },
            select: async () => ({
              data: matchedIds.map((id) => ({ id })),
              error: null,
            }),
          };
          return chain;
        },
        insert(rows) {
          calls.push({ op: 'insert', table, rows });
          return {
            select: async () => ({
              data: faultError
                ? null
                : (Array.isArray(rows) ? rows : [rows]).map((_, index) => ({ id: `fault-${index}` })),
              error: faultError,
            }),
          };
        },
      };
    },
    rpc: async () => ({ data: [], error: null }),
  };
  return { supabase, calls };
}

describe('emergencyStopFleet', () => {
  it('moves the whole project to emergency_stop and writes one audit row per node', async () => {
    const { supabase, calls } = fleetSupabase({ matchedIds: ['ahb-01', 'ahb-02'] });

    const outcome = await emergencyStopFleet(
      { project_id: PROJECT_ID, node_ids: [], reason: 'attitude anomaly' },
      makeDeps(supabase),
      { kind: 'user', userId: 'user-1' },
    );

    expect(outcome).toEqual({
      stopped: 2,
      scope: 'project',
      fault_log_ids: ['fault-0', 'fault-1'],
    });

    const fleetUpdate = calls.find((call) => call.table === 'robot_fleet_nodes');
    expect(fleetUpdate.values).toEqual({ status: 'emergency_stop' });
    expect(calls).toContainEqual({
      op: 'eq',
      table: 'robot_fleet_nodes',
      column: 'project_id',
      value: PROJECT_ID,
    });

    const faultInsert = calls.find((call) => call.table === 'robot_fault_logs');
    expect(faultInsert.rows).toHaveLength(2);
    expect(faultInsert.rows[0]).toMatchObject({
      node_id: 'ahb-01',
      fault_type: 'emergency_stop',
      severity: 'critical',
      diagnostic_trace: {
        reason: 'attitude anomaly',
        scope: 'project',
        project_id: PROJECT_ID,
        requested_by: 'user-1',
        requested_by_kind: 'user',
        requested_at: isoNow(),
      },
    });
  });

  it('uses an id list for a node-scoped stop', async () => {
    const { supabase, calls } = fleetSupabase({ matchedIds: ['ahb-07'] });

    const outcome = await emergencyStopFleet(
      { project_id: null, node_ids: ['ahb-07'], reason: null },
      makeDeps(supabase),
      { kind: 'internal', userId: null },
    );

    expect(outcome.scope).toBe('nodes');
    expect(calls).toContainEqual({
      op: 'in',
      table: 'robot_fleet_nodes',
      column: 'id',
      values: ['ahb-07'],
    });
    expect(outcome.stopped).toBe(1);
  });

  it('writes no audit rows when nothing matched', async () => {
    const { supabase, calls } = fleetSupabase({ matchedIds: [] });

    const outcome = await emergencyStopFleet(
      { project_id: PROJECT_ID, node_ids: [], reason: null },
      makeDeps(supabase),
      { kind: 'internal', userId: null },
    );

    expect(outcome).toEqual({ stopped: 0, scope: 'project', fault_log_ids: [] });
    expect(calls.some((call) => call.table === 'robot_fault_logs')).toBe(false);
  });

  // Safe direction: the robots are already stopped when the audit write fails,
  // and the caller is told about it rather than being told "success".
  it('surfaces an audit failure without undoing the stop', async () => {
    const { supabase, calls } = fleetSupabase({
      matchedIds: ['ahb-01'],
      faultError: { message: 'permission denied for table robot_fault_logs' },
    });

    await expect(
      emergencyStopFleet(
        { project_id: PROJECT_ID, node_ids: [], reason: null },
        makeDeps(supabase),
        { kind: 'user', userId: 'user-1' },
      ),
    ).rejects.toThrow(/Fleet nodes stopped \(1\) but the audit log failed/);

    const fleetUpdate = calls.find((call) => call.table === 'robot_fleet_nodes');
    expect(fleetUpdate.values).toEqual({ status: 'emergency_stop' });
  });
});

// ---------------------------------------------------------------------------
// Queue consumer
// ---------------------------------------------------------------------------

describe('drainSimulationQueue', () => {
  const ENDPOINT = 'https://sim.internal.example.com/run';

  function drainSupabase(claimedRuns) {
    const calls = [];
    const supabase = {
      rpc(fn, args) {
        calls.push({ op: 'rpc', fn, args });
        return Promise.resolve({ data: claimedRuns, error: null });
      },
      from(table) {
        return {
          update(values) {
            calls.push({ op: 'update', table, values });
            const chain = {
              eq: async (column, value) => {
                calls.push({ op: 'eq', table, column, value });
                return { data: null, error: null };
              },
            };
            return chain;
          },
        };
      },
    };
    return { supabase, calls };
  }

  const queuedRun = {
    id: RUN_ID,
    project_id: PROJECT_ID,
    scene_type: 'rough-terrain',
    duration_sec: 45,
    workflow_run_id: 'wf-run-1',
    params: { seed: 7 },
  };

  it('claims via the RPC and records a completed run', async () => {
    const { supabase, calls } = drainSupabase([queuedRun]);
    const deps = makeDeps(supabase, {
      simEndpoint: ENDPOINT,
      fetchImpl: vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ exit_state: 'stable' }),
      })),
    });

    const outcome = await drainSimulationQueue(5, deps);

    expect(calls[0]).toEqual({
      op: 'rpc',
      fn: 'claim_robot_simulation_runs',
      args: { p_limit: 5 },
    });
    expect(deps.assertPublicUrl).toHaveBeenCalledWith(ENDPOINT);
    expect(outcome).toEqual({
      claimed: 1,
      completed: 1,
      failed: 0,
      runs: [{ id: RUN_ID, status: 'completed', exit_state: 'stable' }],
    });

    const completion = calls.find((call) => call.op === 'update');
    expect(completion.values).toEqual({
      status: 'completed',
      exit_state: 'stable',
      completed_at: isoNow(),
    });
  });

  it('posts the run payload to the simulator', async () => {
    const { supabase } = drainSupabase([queuedRun]);
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
    const deps = makeDeps(supabase, { simEndpoint: ENDPOINT, fetchImpl });

    await drainSimulationQueue(1, deps);

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(ENDPOINT);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      run_id: RUN_ID,
      project_id: PROJECT_ID,
      scene_type: 'rough-terrain',
      duration_sec: 45,
      params: { seed: 7 },
      workflow_run_id: 'wf-run-1',
    });
  });

  it('marks a run failed on a non-2xx from the simulator', async () => {
    const { supabase, calls } = drainSupabase([queuedRun]);
    const deps = makeDeps(supabase, {
      simEndpoint: ENDPOINT,
      fetchImpl: vi.fn(async () => ({ ok: false, status: 502, json: async () => ({}) })),
    });

    const outcome = await drainSimulationQueue(1, deps);

    expect(outcome.failed).toBe(1);
    expect(outcome.runs[0].exit_state).toBe('simulator_http_502');
    const completion = calls.find((call) => call.op === 'update');
    expect(completion.values.status).toBe('failed');
  });

  // A 2xx with no readable body has not told us the scene finished.
  it('marks a run failed when the simulator response is unreadable', async () => {
    const { supabase } = drainSupabase([queuedRun]);
    const deps = makeDeps(supabase, {
      simEndpoint: ENDPOINT,
      fetchImpl: vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError('Unexpected token <');
        },
      })),
    });

    const outcome = await drainSimulationQueue(1, deps);
    expect(outcome.runs[0].exit_state).toBe('simulator_unreadable_response');
  });

  it('marks a run failed when the simulator throws', async () => {
    const { supabase } = drainSupabase([queuedRun]);
    const deps = makeDeps(supabase, {
      simEndpoint: ENDPOINT,
      fetchImpl: vi.fn(async () => {
        throw new Error('connect ECONNREFUSED');
      }),
    });

    const outcome = await drainSimulationQueue(1, deps);
    expect(outcome.runs[0].status).toBe('failed');
    expect(outcome.runs[0].exit_state).toMatch(/simulator_error: connect ECONNREFUSED/);
  });

  it('times a hung simulator out instead of hanging the invocation', async () => {
    const { supabase } = drainSupabase([queuedRun]);
    const fetchImpl = vi.fn(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new Error('The operation was aborted')));
        }),
    );

    const outcome = await drainSimulationQueue(1, makeDeps(supabase, {
      simEndpoint: ENDPOINT,
      fetchImpl,
      simTimeoutMs: 10,
    }));

    expect(outcome.runs[0]).toMatchObject({ status: 'failed', exit_state: 'simulator_timeout' });
  });

  // The central honesty guarantee: no simulator, no claim. Queued work survives a
  // configuration gap and the operator gets a 503 rather than silent data loss.
  it('refuses to claim anything when no simulator is configured', async () => {
    const { supabase, calls } = drainSupabase([queuedRun]);
    const deps = makeDeps(supabase);

    await expect(drainSimulationQueue(5, deps)).rejects.toBeInstanceOf(SimulatorNotConfiguredError);
    expect(calls.filter((call) => call.op === 'rpc')).toHaveLength(0);
    expect(calls.filter((call) => call.op === 'update')).toHaveLength(0);
  });

  it('an empty queue is a successful no-op', async () => {
    const { supabase } = drainSupabase([]);
    const deps = makeDeps(supabase, { simEndpoint: ENDPOINT });

    await expect(drainSimulationQueue(5, deps)).resolves.toEqual({
      claimed: 0,
      completed: 0,
      failed: 0,
      runs: [],
    });
  });

  it('propagates a claim failure', async () => {
    const supabase = {
      rpc: async () => ({ data: null, error: { message: 'function does not exist' } }),
      from: () => ({}),
    };
    await expect(
      drainSimulationQueue(1, makeDeps(supabase, { simEndpoint: ENDPOINT })),
    ).rejects.toThrow(/Failed to claim queued runs/);
  });
});

describe('simulationQueueStats', () => {
  it('counts queued and running separately and reports the oldest queued age', async () => {
    const { supabase, calls, state } = makeSupabase();
    // `makeChain.limit()` resolves to `state.rows`, so this is the rowset the
    // `.in('status', [...]).order('created_at').limit(500)` chain returns.
    state.rows = [
      { id: 'a', status: 'queued', created_at: '2026-11-04T01:00:00Z' },
      { id: 'b', status: 'queued', created_at: '2026-11-04T02:00:00Z' },
      { id: 'c', status: 'running', created_at: '2026-11-04T00:30:00Z' },
    ];

    const stats = await simulationQueueStats(makeDeps(supabase));

    expect(stats).toEqual({
      queued: 2,
      running: 1,
      oldest_queued_at: '2026-11-04T01:00:00Z',
    });
    // It reads only the two live statuses, not the whole history.
    expect(calls).toContainEqual({
      op: 'select',
      table: 'robot_simulation_runs',
      method: 'in',
      column: 'status',
      values: ['queued', 'running'],
    });
  });
});
