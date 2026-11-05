// @vitest-environment node
/**
 * Proving tests for `supabase/functions/_shared/mcpSupabase.ts`.
 *
 * The adapter is where a `SelectSpec` becomes a PostgREST chain, so it is the
 * one place a column name or an operator could be silently mistranslated. The
 * fake client records the exact call sequence, which is what these assert.
 */
import { describe, expect, it } from 'vitest';

import { buildSelect, createDataAccess } from '../supabase/functions/_shared/mcpSupabase.ts';

/** Records the chain it was asked to build and resolves to `outcome`. */
function createRecordingClient(outcome = { data: [], error: null }, insertOutcome = { data: null, error: null }) {
  const recorded = [];

  return {
    recorded,
    from(table) {
      return {
        select(columns) {
          const entry = { table, columns, steps: [] };
          recorded.push(entry);
          const chain = {
            eq(column, value) {
              entry.steps.push({ op: 'eq', column, value });
              return chain;
            },
            gte(column, value) {
              entry.steps.push({ op: 'gte', column, value });
              return chain;
            },
            order(column, options) {
              entry.steps.push({ op: 'order', column, options });
              return chain;
            },
            limit(count) {
              entry.steps.push({ op: 'limit', count });
              return chain;
            },
            then(onFulfilled, onRejected) {
              return Promise.resolve(outcome).then(onFulfilled, onRejected);
            },
          };
          return chain;
        },
        insert(row) {
          recorded.push({ table, insert: row });
          return {
            then(onFulfilled, onRejected) {
              return Promise.resolve(insertOutcome).then(onFulfilled, onRejected);
            },
          };
        },
      };
    },
  };
}

describe('buildSelect', () => {
  it('applies filters in order, then order, then limit', () => {
    const client = createRecordingClient();

    buildSelect(client, 'hitl_audit_logs', {
      columns: 'id,action',
      filters: [
        ['status', 'eq', 'Pending'],
        ['timestamp', 'gte', '2026-01-01'],
      ],
      order: { column: 'timestamp', ascending: false },
      limit: 5,
    });

    expect(client.recorded).toEqual([
      {
        table: 'hitl_audit_logs',
        columns: 'id,action',
        steps: [
          { op: 'eq', column: 'status', value: 'Pending' },
          { op: 'gte', column: 'timestamp', value: '2026-01-01' },
          { op: 'order', column: 'timestamp', options: { ascending: false } },
          { op: 'limit', count: 5 },
        ],
      },
    ]);
  });

  it('applies no order or limit when the spec omits them', () => {
    const client = createRecordingClient();
    buildSelect(client, 'telemetry_events', { columns: 'id', filters: [] });
    expect(client.recorded[0].steps).toEqual([]);
  });
});

describe('createDataAccess', () => {
  it('returns the rows PostgREST gave it', async () => {
    const client = createRecordingClient({ data: [{ id: 'r1' }], error: null });
    const data = createDataAccess(client);

    const outcome = await data.select('telemetry_events', { columns: 'id' });
    expect(outcome).toEqual({ data: [{ id: 'r1' }], error: null });
  });

  it('passes a PostgREST error through untouched', async () => {
    const client = createRecordingClient({ data: null, error: { message: 'column does not exist' } });
    const outcome = await createDataAccess(client).select('telemetry_events', { columns: 'action_name' });
    expect(outcome.error.message).toBe('column does not exist');
    expect(outcome.data).toBeNull();
  });

  it('normalises a null data payload to null rather than undefined', async () => {
    const client = createRecordingClient({ data: undefined, error: null });
    const outcome = await createDataAccess(client).select('telemetry_events', { columns: 'id' });
    expect(outcome.data).toBeNull();
  });

  it('sends an insert row verbatim and reports its error', async () => {
    const client = createRecordingClient(undefined, { data: null, error: { message: 'rls denied' } });
    const outcome = await createDataAccess(client).insert('hitl_audit_logs', { action: 'x' });

    expect(client.recorded[0]).toEqual({ table: 'hitl_audit_logs', insert: { action: 'x' } });
    expect(outcome.error.message).toBe('rls denied');
  });

  it('times a probe and reports ok when the query succeeds', async () => {
    const client = createRecordingClient({ data: [{ id: 'x' }], error: null });
    let clock = 1000;
    const data = createDataAccess(client, { now: () => (clock += 5) });

    const probe = await data.probe();
    expect(probe.ok).toBe(true);
    expect(probe.latencyMs).toBe(5);
    // The probe must be bounded — a full-table select on every health check
    // would be its own outage.
    expect(client.recorded[0].steps).toEqual([{ op: 'limit', count: 1 }]);
  });

  it('reports a failed probe with the database message', async () => {
    const client = createRecordingClient({ data: null, error: { message: 'relation does not exist' } });
    const probe = await createDataAccess(client).probe();
    expect(probe.ok).toBe(false);
    expect(probe.detail).toBe('relation does not exist');
  });

  it('reports a thrown probe as a failed probe, not an exception', async () => {
    const client = {
      from() {
        throw new Error('socket hang up');
      },
    };
    const probe = await createDataAccess(client).probe();
    expect(probe.ok).toBe(false);
    expect(probe.detail).toBe('socket hang up');
  });
});
