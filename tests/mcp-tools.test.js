// @vitest-environment node
/**
 * Proving tests for `supabase/functions/_shared/mcpTools.ts`.
 *
 * The column contracts are the point of this file. The Cloudflare MCP bridge
 * already ships an `axim_dispatch_task` that inserts `action_name`, `payload`,
 * `requested_by` and `created_at` into `public.hitl_audit_logs`, and a
 * `hitl_queue_status` that selects `action_name` and filters `status = 'pending'`.
 * None of those columns exist and the migration default is `'Pending'`, so every
 * one of those calls is a PostgREST 400 that the bridge reports as a generic tool
 * error. These tests pin the real shape so the Edge implementation cannot drift
 * the same way.
 */
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_LOOKUP_LIMIT,
  HITL_PENDING_STATUS,
  MAX_LOOKUP_LIMIT,
  UnknownToolError,
  callTool,
  listTools,
  toolNames,
} from '../supabase/functions/_shared/mcpTools.ts';

/**
 * Records what the tools asked the database for, so a wrong column or a missing
 * filter fails here instead of at runtime.
 */
function createFakeData({ rows = [], error = null, insertError = null } = {}) {
  const selects = [];
  const inserts = [];
  let probeResult = { ok: true, latencyMs: 7 };

  return {
    selects,
    inserts,
    setProbe(next) {
      probeResult = next;
    },
    async select(table, spec) {
      selects.push({ table, spec });
      return { data: error ? null : rows, error };
    },
    async insert(table, row) {
      inserts.push({ table, row });
      return { error: insertError };
    },
    async probe() {
      return probeResult;
    },
  };
}

const USER_ACTOR = { kind: 'user', userId: '11111111-1111-1111-1111-111111111111' };
const INTERNAL_ACTOR = { kind: 'internal', userId: null };

function contextFor(actor, data, now = () => 1_700_000_000_000) {
  return { actor, data, now };
}

describe('tool registry', () => {
  it('publishes five uniquely named tools with schemas', () => {
    const tools = listTools();
    expect(tools).toHaveLength(5);
    expect(new Set(toolNames()).size).toBe(tools.length);
    for (const tool of tools) {
      expect(typeof tool.description).toBe('string');
      expect(tool.description.length).toBeGreaterThan(10);
      expect(tool.inputSchema.type).toBe('object');
    }
  });

  it('returns copies, so a caller cannot mutate the registry', () => {
    const first = listTools();
    first[0].name = 'hijacked';
    expect(listTools()[0].name).not.toBe('hijacked');
  });

  it('refuses a tool it does not have', async () => {
    await expect(
      callTool('definitely_not_a_tool', {}, contextFor(USER_ACTOR, createFakeData())),
    ).rejects.toBeInstanceOf(UnknownToolError);
  });
});

describe('core_health_check', () => {
  it('reports latency and a timestamp from the injected clock', async () => {
    const data = createFakeData();
    data.setProbe({ ok: true, latencyMs: 12 });

    const result = await callTool('core_health_check', {}, contextFor(USER_ACTOR, data));

    expect(result.isError).toBe(false);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.status).toBe('healthy');
    expect(payload.latency_ms).toBe(12);
    expect(payload.timestamp).toBe(new Date(1_700_000_000_000).toISOString());
  });

  it('reports degraded rather than healthy when the probe fails', async () => {
    const data = createFakeData();
    data.setProbe({ ok: false, latencyMs: 30, detail: 'connection refused' });

    const result = await callTool('core_health_check', {}, contextFor(USER_ACTOR, data));

    const payload = JSON.parse(result.content[0].text);
    expect(payload.status).toBe('degraded');
    expect(payload.detail).toBe('connection refused');
  });
});

describe('telemetry_lookup', () => {
  it('selects the real telemetry_events columns and filters on app_id/event_type', async () => {
    const data = createFakeData({ rows: [{ id: 'e1' }] });

    const result = await callTool(
      'telemetry_lookup',
      { app_id: 'speedreport', event_type: 'speed_test_completed' },
      contextFor(USER_ACTOR, data),
    );

    expect(result.isError).toBe(false);
    expect(data.selects).toHaveLength(1);
    const [{ table, spec }] = data.selects;
    expect(table).toBe('telemetry_events');
    // telemetry_events has no severity/component_id/message column; the bridge
    // queries all three and gets a 400 for its trouble.
    expect(spec.columns).toBe('id,app_id,event_type,metadata,created_at');
    expect(spec.filters).toEqual([
      ['app_id', 'eq', 'speedreport'],
      ['event_type', 'eq', 'speed_test_completed'],
    ]);
    expect(spec.order).toEqual({ column: 'created_at', ascending: false });
    expect(spec.limit).toBe(DEFAULT_LOOKUP_LIMIT);
  });

  it('applies no filter when the arguments are absent', async () => {
    const data = createFakeData();
    await callTool('telemetry_lookup', {}, contextFor(USER_ACTOR, data));
    expect(data.selects[0].spec.filters).toEqual([]);
  });

  it('clamps a limit and floors it at one', async () => {
    const data = createFakeData();
    await callTool('telemetry_lookup', { limit: 5000 }, contextFor(USER_ACTOR, data));
    await callTool('telemetry_lookup', { limit: -3 }, contextFor(USER_ACTOR, data));
    expect(data.selects[0].spec.limit).toBe(MAX_LOOKUP_LIMIT);
    expect(data.selects[1].spec.limit).toBe(1);
  });

  it('rejects a non-string filter instead of interpolating it', async () => {
    const data = createFakeData();
    const result = await callTool('telemetry_lookup', { app_id: 42 }, contextFor(USER_ACTOR, data));
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('app_id must be a string');
    expect(data.selects).toHaveLength(0);
  });

  it('surfaces a query error verbatim', async () => {
    const data = createFakeData({ error: { message: 'permission denied' } });
    const result = await callTool('telemetry_lookup', {}, contextFor(USER_ACTOR, data));
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('permission denied');
  });
});

describe('hitl_queue_status', () => {
  it("filters on the migration's capitalised Pending status, not lowercase", async () => {
    const data = createFakeData({ rows: [{ id: 'h1', status: 'Pending' }] });

    const result = await callTool('hitl_queue_status', {}, contextFor(USER_ACTOR, data));

    expect(result.isError).toBe(false);
    const [{ table, spec }] = data.selects;
    expect(table).toBe('hitl_audit_logs');
    // The bridge selects `action_name`, which is not a column.
    expect(spec.columns).toBe('id,action,tool_called,status,target_department,timestamp');
    expect(spec.filters).toEqual([['status', 'eq', 'Pending']]);
    expect(HITL_PENDING_STATUS).toBe('Pending');
    const payload = JSON.parse(result.content[0].text);
    expect(payload.pending_approvals).toBe(1);
  });

  it('adds a department filter when asked', async () => {
    const data = createFakeData();
    await callTool('hitl_queue_status', { target_department: 'CFO' }, contextFor(USER_ACTOR, data));
    expect(data.selects[0].spec.filters).toEqual([
      ['status', 'eq', 'Pending'],
      ['target_department', 'eq', 'CFO'],
    ]);
  });
});

describe('axim_list_nodes', () => {
  it('selects only columns that exist after the 20280107 additions', async () => {
    const data = createFakeData({ rows: [] });
    await callTool('axim_list_nodes', { status: 'operational', limit: 3 }, contextFor(USER_ACTOR, data));

    const [{ table, spec }] = data.selects;
    expect(table).toBe('ecosystem_nodes');
    expect(spec.columns).toBe(
      'id,app_name,status,health_endpoint_url,last_ping,node_id,name,endpoint,node_type,last_heartbeat',
    );
    expect(spec.filters).toEqual([['status', 'eq', 'operational']]);
    expect(spec.order).toEqual({ column: 'app_name', ascending: true });
    expect(spec.limit).toBe(3);
  });
});

describe('axim_dispatch_task', () => {
  it('refuses an internal caller, because admin_id references auth.users', async () => {
    const data = createFakeData();

    const result = await callTool(
      'axim_dispatch_task',
      { action: 'Quarantine app' },
      contextFor(INTERNAL_ACTOR, data),
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('requires a verified user caller');
    expect(data.inserts).toHaveLength(0);
  });

  it('stages the row with real column names and the caller as admin_id', async () => {
    const data = createFakeData();

    const result = await callTool(
      'axim_dispatch_task',
      { action: 'Quarantine app', target_department: 'CORE', tool_called: 'axim_dispatch_task' },
      contextFor(USER_ACTOR, data),
    );

    expect(result.isError).toBe(false);
    expect(data.inserts).toHaveLength(1);
    const [{ table, row }] = data.inserts;
    expect(table).toBe('hitl_audit_logs');
    // No action_name, no payload, no requested_by, no created_at.
    expect(row).toEqual({
      admin_id: USER_ACTOR.userId,
      action: 'Quarantine app',
      status: 'Pending',
      target_department: 'CORE',
      tool_called: 'axim_dispatch_task',
    });
    expect(JSON.parse(result.content[0].text).status).toBe('STAGED_FOR_APPROVAL');
  });

  it('requires a non-empty action', async () => {
    const data = createFakeData();
    const result = await callTool('axim_dispatch_task', { action: '   ' }, contextFor(USER_ACTOR, data));
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('action is required');
    expect(data.inserts).toHaveLength(0);
  });

  it('surfaces an insert error rather than claiming success', async () => {
    const data = createFakeData({ insertError: { message: 'null value in column "admin_id"' } });
    const result = await callTool(
      'axim_dispatch_task',
      { action: 'Quarantine app' },
      contextFor(USER_ACTOR, data),
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('staging the task failed');
  });
});
