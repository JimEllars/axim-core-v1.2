// @vitest-environment node
/**
 * Proving tests for `supabase/functions/_shared/mcpAuthz.ts`.
 *
 * The surface's previous rule was "authenticated", which meant any verified user
 * could stage an entry in the human approval queue through `axim_dispatch_task`.
 * `public.hitl_audit_logs` restricts INSERT to `public.users.role = 'admin'`, but
 * the tools write with the service key and never touch that policy. These tests
 * pin the restored rule, and — more importantly — pin that a tool with no policy
 * is refused rather than allowed, so the gap cannot reopen by omission.
 */
import { describe, expect, it, vi } from 'vitest';

import {
  TOOL_POLICIES,
  USERS_COLUMNS,
  USERS_TABLE,
  actorFromCaller,
  decideToolCall,
  policyFor,
  resolveActorRole,
  resolveMcpActor,
  unpoliciedTools,
  visibleTools,
} from '../supabase/functions/_shared/mcpAuthz.ts';
import { TOOL_DESCRIPTORS, toolNames } from '../supabase/functions/_shared/mcpTools.ts';

const ADMIN = { kind: 'user', userId: 'u-admin', role: 'admin' };
const OPERATOR = { kind: 'user', userId: 'u-operator', role: 'user' };
const UNPROVISIONED = { kind: 'user', userId: 'u-no-profile', role: null };
const INTERNAL = { kind: 'internal', userId: null, role: null };
const ANONYMOUS = { kind: 'anonymous', userId: null, role: null };

/** Records every `select` it is asked to run and answers from a role table. */
function fakeData(roles = {}, options = {}) {
  const calls = [];
  return {
    calls,
    async select(table, spec) {
      calls.push({ table, spec });
      if (options.error) return { data: null, error: { message: options.error } };
      const rows = Object.entries(roles)
        .filter(([id]) => !spec.filters?.length || spec.filters.every(([column, , value]) => column === 'id' && value === id))
        .map(([id, role]) => ({ id, role }));
      return { data: spec.limit === 1 ? rows.slice(0, 1) : rows, error: null };
    },
  };
}

describe('policy coverage', () => {
  it('declares a policy for every registered tool', () => {
    expect(unpoliciedTools(toolNames())).toEqual([]);
  });

  it('declares no policy for a tool that is not registered', () => {
    const registered = new Set(toolNames());
    expect(Object.keys(TOOL_POLICIES).filter((name) => !registered.has(name))).toEqual([]);
  });

  it('does not resolve a policy through the object prototype', () => {
    // `TOOL_POLICIES['constructor']` is a function on any plain object; a
    // truthiness check would hand back a "policy" for a tool that has none.
    expect(policyFor('constructor')).toBeNull();
    expect(policyFor('__proto__')).toBeNull();
    expect(decideToolCall('constructor', ADMIN).ok).toBe(false);
  });

  it('keeps the registry and the policy table the same size', () => {
    expect(Object.keys(TOOL_POLICIES).length).toBe(TOOL_DESCRIPTORS.length);
  });
});

describe('decideToolCall — read scope', () => {
  it('admits a provisioned user', () => {
    expect(decideToolCall('telemetry_lookup', OPERATOR)).toEqual({ ok: true });
  });

  it('admits an internal caller with no profile row', () => {
    // The internal service key is how cron and the satellites read the registry.
    expect(decideToolCall('axim_list_nodes', INTERNAL)).toEqual({ ok: true });
  });

  it('admits an unprovisioned user to read tools', () => {
    // Reading the satellite registry is granted to all authenticated users by
    // 20270301000000, so a missing profile row must not narrow it.
    expect(decideToolCall('axim_list_nodes', UNPROVISIONED)).toEqual({ ok: true });
  });

  it('refuses an anonymous caller on every registered tool', () => {
    for (const name of toolNames()) {
      const decision = decideToolCall(name, ANONYMOUS);
      expect(decision.ok, name).toBe(false);
      expect(decision.reason).toContain('anonymous');
    }
  });
});

describe('decideToolCall — admin scope', () => {
  it('refuses an internal caller even though it holds the service key', () => {
    const decision = decideToolCall('axim_dispatch_task', INTERNAL);

    expect(decision.ok).toBe(false);
    expect(decision.scope).toBe('mcp:admin');
    expect(decision.reason).toContain('requires a user identity');
  });

  it('refuses a user whose role is "user"', () => {
    const decision = decideToolCall('axim_dispatch_task', OPERATOR);

    expect(decision.ok).toBe(false);
    expect(decision.reason).toContain('requires role "admin"');
    expect(decision.reason).toContain('"user"');
  });

  it('refuses a user with no profile row, naming the null role', () => {
    const decision = decideToolCall('hitl_queue_status', UNPROVISIONED);

    expect(decision.ok).toBe(false);
    // A failed or empty lookup must read as "no role", never as an admin.
    expect(decision.reason).toContain('role null');
  });

  it('admits an admin to both admin-scope tools', () => {
    expect(decideToolCall('hitl_queue_status', ADMIN)).toEqual({ ok: true });
    expect(decideToolCall('axim_dispatch_task', ADMIN)).toEqual({ ok: true });
  });
});

describe('decideToolCall — unpolicied tool', () => {
  it('refuses by default and says why', () => {
    const decision = decideToolCall('definitely_not_registered', ADMIN);

    expect(decision.ok).toBe(false);
    expect(decision.scope).toBe('unknown');
    expect(decision.reason).toContain('no authorisation policy');
  });
});

describe('visibleTools', () => {
  it('hides the admin tools from a non-admin without hiding the read tools', () => {
    const names = visibleTools(TOOL_DESCRIPTORS, OPERATOR).map((tool) => tool.name);

    expect(names).toEqual(['core_health_check', 'telemetry_lookup', 'axim_list_nodes']);
  });

  it('shows an admin the full registry', () => {
    expect(visibleTools(TOOL_DESCRIPTORS, ADMIN).map((tool) => tool.name)).toEqual(toolNames());
  });

  it('shows an internal caller the read tools only', () => {
    expect(visibleTools(TOOL_DESCRIPTORS, INTERNAL).map((tool) => tool.name)).toEqual([
      'core_health_check',
      'telemetry_lookup',
      'axim_list_nodes',
    ]);
  });
});

describe('resolveActorRole', () => {
  it('reads public.users by primary key, one row, two columns', async () => {
    const data = fakeData({ 'u-admin': 'admin' });

    await expect(resolveActorRole(data, 'u-admin')).resolves.toBe('admin');
    expect(data.calls).toHaveLength(1);
    expect(data.calls[0].table).toBe(USERS_TABLE);
    expect(data.calls[0].table).toBe('users');
    expect(data.calls[0].spec.columns).toBe(USERS_COLUMNS);
    expect(data.calls[0].spec.filters).toEqual([['id', 'eq', 'u-admin']]);
    expect(data.calls[0].spec.limit).toBe(1);
  });

  it('returns "user" for a provisioned non-admin', async () => {
    await expect(resolveActorRole(fakeData({ 'u-operator': 'user' }), 'u-operator')).resolves.toBe('user');
  });

  it('returns null when the caller has no profile row', async () => {
    await expect(resolveActorRole(fakeData({}), 'u-ghost')).resolves.toBeNull();
  });

  it('returns null when the lookup fails, so a database fault denies a write', async () => {
    await expect(resolveActorRole(fakeData({}, { error: 'connection reset' }), 'u-admin')).resolves.toBeNull();
  });

  it('returns null for an unrecognised role value', async () => {
    await expect(resolveActorRole(fakeData({ 'u-x': 'superuser' }), 'u-x')).resolves.toBeNull();
  });

  it('does not query the database when there is no user id', async () => {
    const data = fakeData({});

    await expect(resolveActorRole(data, null)).resolves.toBeNull();
    expect(data.calls).toHaveLength(0);
  });
});

describe('resolveMcpActor', () => {
  it('resolves the role for a user caller', async () => {
    const actor = await resolveMcpActor({ caller: { kind: 'user', userId: 'u-admin', via: 'user_jwt' }, data: fakeData({ 'u-admin': 'admin' }) });

    expect(actor).toEqual({ kind: 'user', userId: 'u-admin', role: 'admin' });
  });

  it('costs no query for an internal caller', async () => {
    const data = fakeData({});
    const actor = await resolveMcpActor({ caller: { kind: 'internal', userId: null, via: 'internal_key' }, data });

    expect(actor).toEqual({ kind: 'internal', userId: null, role: null });
    expect(data.calls).toHaveLength(0);
  });
});

describe('actorFromCaller', () => {
  it('defaults to no role, never to admin', () => {
    expect(actorFromCaller({ kind: 'user', userId: 'u1', via: 'user_jwt' })).toEqual({
      kind: 'user',
      userId: 'u1',
      role: null,
    });
  });

  it('denies an admin tool for the default actor', () => {
    const actor = actorFromCaller({ kind: 'user', userId: 'u1', via: 'user_jwt' });
    expect(decideToolCall('axim_dispatch_task', actor).ok).toBe(false);
  });
});

describe('no accidental network use', () => {
  it('never touches fetch', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    await resolveActorRole(fakeData({ 'u-admin': 'admin' }), 'u-admin');
    decideToolCall('axim_dispatch_task', ADMIN);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
