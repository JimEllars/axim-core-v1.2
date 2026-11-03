/**
 * Proving tests for the workflow History data path.
 *
 * Defect this covers (Continued Development Plan §5, second bullet):
 *
 *   `supabaseApiService.getWorkflowExecutions()` read `events_ax2024`, a table
 *   the DAG runner never writes to. The History tab therefore showed nothing
 *   for real runs, and when it did show a row it had no `status` and no
 *   `error_message` - so a run that aborted mid-DAG looked the same as one that
 *   completed. The runner persists one row per run in `workflow_execution_logs`
 *   (migration 20281101010000) with both fields.
 *
 * The legacy read is kept as a fallback for projects where the migration is not
 * applied yet, but only for "relation not found" - a permission or network error
 * must surface as an error instead of quietly emptying the table.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock('../logging', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import supabaseApiService, {
  isMissingRelationError,
  normalizeExecutionLogRow,
  normalizeLegacyExecutionRow,
} from '../supabaseApiService';

/**
 * Minimal chainable stub: remembers the table and the columns selected, and
 * resolves the awaited tail with whatever the test supplies.
 */
function makeSupabase(tableResults) {
  const queries = [];

  const client = {
    from(table) {
      const query = { table, columns: null };
      queries.push(query);

      const builder = {
        select: vi.fn((columns) => {
          query.columns = columns;
          return builder;
        }),
        order: vi.fn((column, options) => {
          query.order = { column, options };
          return builder;
        }),
        or: vi.fn((expression) => {
          query.or = expression;
          return builder;
        }),
        limit: vi.fn((count) => {
          query.limit = count;
          return builder;
        }),
        eq: vi.fn(() => builder),
        then: (onFulfilled, onRejected) => {
          const result = tableResults[table] ?? { data: [], error: null };
          return Promise.resolve(result).then(onFulfilled, onRejected);
        },
      };

      return builder;
    },
  };

  return { client, queries };
}

const onlineConnectivity = { getIsOnline: () => true };
const offline = { queueRequest: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  supabaseApiService.initialize(makeSupabase({}).client, onlineConnectivity, offline);
});

describe('isMissingRelationError', () => {
  it('recognises the Postgres undefined-table code', () => {
    expect(isMissingRelationError({ code: '42P01' })).toBe(true);
  });

  it('recognises the PostgREST schema-cache miss', () => {
    expect(
      isMissingRelationError({
        code: 'PGRST205',
        message: "Could not find the table 'public.workflow_execution_logs' in the schema cache",
      }),
    ).toBe(true);
  });

  it('does not swallow permission or transport failures', () => {
    // 42501 = insufficient_privilege (an RLS denial). Falling back to the legacy
    // table here would hide a misconfigured policy as "no history yet".
    expect(isMissingRelationError({ code: '42501', message: 'permission denied for table' })).toBe(
      false,
    );
    expect(isMissingRelationError({ code: 'PGRST301', message: 'JWT expired' })).toBe(false);
    expect(isMissingRelationError(null)).toBe(false);
  });
});

describe('normalizeExecutionLogRow', () => {
  const row = {
    id: 'log-1',
    workflow_id: 'wf-1',
    workflow_run_id: 'wf_run_abc12345',
    workflow_name: 'Lead Orchestration',
    status: 'failed',
    error_message: 'Node "Notify CRM" is missing required config.url',
    node_results: [
      { step: 'Format Payload', success: true },
      { step: 'Notify CRM', success: false },
    ],
    duration_ms: 1450,
    execution_context: { source: 'workflow_builder_ui' },
    created_at: '2026-11-01T12:00:00.000Z',
  };

  it('carries status, error and per-step counts straight through', () => {
    expect(normalizeExecutionLogRow(row)).toMatchObject({
      id: 'log-1',
      workflow_run_id: 'wf_run_abc12345',
      workflow_name: 'Lead Orchestration',
      status: 'failed',
      error_message: 'Node "Notify CRM" is missing required config.url',
      steps_total: 2,
      steps_succeeded: 1,
      duration_ms: 1450,
      source: 'workflow_execution_logs',
    });
  });

  it('treats a completed row as completed and tolerates missing arrays', () => {
    const normalized = normalizeExecutionLogRow({ ...row, status: 'completed', node_results: null });
    expect(normalized.status).toBe('completed');
    expect(normalized.node_results).toEqual([]);
    expect(normalized.steps_total).toBe(0);
  });

  it('falls back to a placeholder name and null duration', () => {
    const normalized = normalizeExecutionLogRow({ id: 'log-2', status: 'completed' });
    expect(normalized.workflow_name).toBe('Untitled workflow');
    expect(normalized.duration_ms).toBeNull();
    expect(normalized.error_message).toBeNull();
  });
});

describe('normalizeLegacyExecutionRow', () => {
  it('derives success from the legacy data.results array', () => {
    const normalized = normalizeLegacyExecutionRow({
      id: 'ev-1',
      created_at: '2026-10-01T00:00:00.000Z',
      data: {
        workflow_name: 'Weekly Export',
        results: [{ success: true }, { success: true }],
        duration_ms: 900,
      },
    });

    expect(normalized).toMatchObject({
      workflow_name: 'Weekly Export',
      status: 'completed',
      steps_total: 2,
      steps_succeeded: 2,
      duration_ms: 900,
      source: 'events_ax2024',
    });
  });

  it('marks a legacy row with a failed step as failed', () => {
    const normalized = normalizeLegacyExecutionRow({
      id: 'ev-2',
      data: { results: [{ success: true }, { success: false }] },
    });
    expect(normalized.status).toBe('failed');
    expect(normalized.steps_succeeded).toBe(1);
  });

  it('does not claim success for a legacy row with no step detail', () => {
    // The previous UI showed these as a warning; the data must not be upgraded
    // to 'completed' just because nothing said otherwise.
    expect(normalizeLegacyExecutionRow({ id: 'ev-3', data: {} }).status).toBe('unknown');
    expect(normalizeLegacyExecutionRow({ id: 'ev-4' }).status).toBe('unknown');
  });
});

describe('supabaseApiService.getWorkflowExecutions', () => {
  it('reads workflow_execution_logs and returns normalised rows', async () => {
    const { client, queries } = makeSupabase({
      workflow_execution_logs: {
        data: [
          {
            id: 'log-1',
            workflow_name: 'Lead Orchestration',
            status: 'failed',
            error_message: 'boom',
            node_results: [{ success: false }],
            duration_ms: 500,
            created_at: '2026-11-01T12:00:00.000Z',
          },
        ],
        error: null,
      },
    });
    supabaseApiService.initialize(client, onlineConnectivity, offline);

    const executions = await supabaseApiService.getWorkflowExecutions();

    expect(queries[0].table).toBe('workflow_execution_logs');
    expect(queries[0].columns).toContain('status');
    expect(queries[0].columns).toContain('error_message');
    expect(queries[0].columns).toContain('node_results');
    expect(queries[0].order).toEqual({ column: 'created_at', options: { ascending: false } });
    expect(executions).toHaveLength(1);
    expect(executions[0]).toMatchObject({ status: 'failed', error_message: 'boom', steps_total: 1 });
  });

  it('falls back to the legacy event stream when the table is not migrated yet', async () => {
    const { client, queries } = makeSupabase({
      workflow_execution_logs: {
        data: null,
        error: { code: 'PGRST205', message: "Could not find the table 'public.workflow_execution_logs'" },
      },
      events_ax2024: {
        data: [{ id: 'ev-1', created_at: '2026-10-01T00:00:00.000Z', data: { workflow_name: 'Old Run', results: [{ success: true }] } }],
        error: null,
      },
    });
    supabaseApiService.initialize(client, onlineConnectivity, offline);

    const executions = await supabaseApiService.getWorkflowExecutions();

    expect(queries.map((query) => query.table)).toEqual(['workflow_execution_logs', 'events_ax2024']);
    expect(executions[0]).toMatchObject({ workflow_name: 'Old Run', status: 'completed', source: 'events_ax2024' });
  });

  it('surfaces a non-missing-relation error instead of falling back', async () => {
    const { client, queries } = makeSupabase({
      workflow_execution_logs: {
        data: null,
        error: { code: '42501', message: 'permission denied for table workflow_execution_logs' },
      },
    });
    supabaseApiService.initialize(client, onlineConnectivity, offline);

    await expect(supabaseApiService.getWorkflowExecutions()).rejects.toThrow(/permission denied/);
    expect(queries.map((query) => query.table)).toEqual(['workflow_execution_logs']);
  });
});
