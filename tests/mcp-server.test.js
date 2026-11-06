// @vitest-environment node
/**
 * Proving tests for `supabase/functions/_shared/mcpServer.ts`.
 *
 * This module holds the authorisation decision for the whole MCP surface, so the
 * negative cases are the point: anonymous is refused, a presented-but-invalid
 * signature is terminal (it must not fall through to a bearer check), and an
 * unset key never matches. It also decides the follow-up URL, where the two front
 * doors have different paths — the worker routes `/message`, not
 * `/functions/v1/mcp-message`.
 */
import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  UNAUTHENTICATED_MESSAGE,
  authoriseMcpCaller,
  buildRpcContext,
  messageEndpoint,
  sessionSecret,
} from '../supabase/functions/_shared/mcpServer.ts';
import { MemoryQuotaStore, WRITE_QUOTA } from '../supabase/functions/_shared/mcpQuota.ts';

const INTERNAL_KEY = 'internal-test-key-not-a-fallback';
const BODY = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' });
const NOW = 1_780_000_000_000;

function envFrom(map) {
  return { get: (key) => map[key] };
}

function hmacHex(secret, message) {
  return createHmac('sha256', secret).update(message).digest('hex');
}

function v2Headers(secret, body, seconds) {
  return new Headers({
    'X-Axim-Signature-Version': '2',
    'X-Axim-Timestamp': String(seconds),
    'X-Axim-Signature': `sha256=${hmacHex(secret, `${seconds}.${body}`)}`,
  });
}

describe('authoriseMcpCaller', () => {
  it('refuses an anonymous caller', async () => {
    const result = await authoriseMcpCaller({
      headers: new Headers(),
      rawBody: BODY,
      env: envFrom({ AXIM_INTERNAL_KEY: INTERNAL_KEY }),
      nowMs: NOW,
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
    expect(result.reason).toBe(UNAUTHENTICATED_MESSAGE);
  });

  it('admits the internal service key presented as a bearer token', async () => {
    const result = await authoriseMcpCaller({
      headers: new Headers({ Authorization: `Bearer ${INTERNAL_KEY}` }),
      rawBody: BODY,
      env: envFrom({ AXIM_INTERNAL_KEY: INTERNAL_KEY }),
      nowMs: NOW,
    });

    expect(result.ok).toBe(true);
    expect(result.caller.kind).toBe('internal');
    expect(result.caller.via).toBe('internal_key');
  });

  it('admits a signed v2 relay and records the mode', async () => {
    const seconds = NOW / 1000;
    const result = await authoriseMcpCaller({
      headers: v2Headers(INTERNAL_KEY, BODY, seconds),
      rawBody: BODY,
      env: envFrom({ AXIM_INTERNAL_KEY: INTERNAL_KEY }),
      nowMs: NOW,
    });

    expect(result.ok).toBe(true);
    expect(result.caller.kind).toBe('internal');
    expect(result.caller.via).toBe('hmac:v2');
  });

  it('refuses a bad signature without falling through to a bearer token', async () => {
    // The caller claims to be a signed relay and also presents a valid bearer
    // token. A wrong HMAC is terminal: honouring the token would let anyone
    // bypass the signature requirement by sending junk alongside a key.
    const headers = v2Headers(INTERNAL_KEY, 'a different body', NOW / 1000);
    headers.set('Authorization', `Bearer ${INTERNAL_KEY}`);

    const result = await authoriseMcpCaller({
      headers,
      rawBody: BODY,
      env: envFrom({ AXIM_INTERNAL_KEY: INTERNAL_KEY }),
      nowMs: NOW,
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toContain('signature rejected');
  });

  it('admits a user whose token verifies', async () => {
    const result = await authoriseMcpCaller({
      headers: new Headers({ Authorization: 'Bearer user-token' }),
      rawBody: BODY,
      env: envFrom({}),
      nowMs: NOW,
      verifyUser: async (token) => (token === 'user-token' ? 'user-1' : null),
    });

    expect(result.ok).toBe(true);
    expect(result.caller).toEqual({ kind: 'user', userId: 'user-1', via: 'user_jwt' });
  });

  it('refuses a token that does not resolve to a user', async () => {
    const result = await authoriseMcpCaller({
      headers: new Headers({ Authorization: 'Bearer junk' }),
      rawBody: BODY,
      env: envFrom({}),
      nowMs: NOW,
      verifyUser: async () => null,
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
  });

  it('fails closed when no key is configured', async () => {
    // `Bearer undefined` is what a literal fallback key would have matched.
    for (const presented of ['Bearer undefined', 'Bearer null', 'Bearer ']) {
      const result = await authoriseMcpCaller({
        headers: new Headers({ Authorization: presented }),
        rawBody: BODY,
        env: envFrom({}),
        nowMs: NOW,
      });
      expect(result.ok, `admitted ${presented}`).toBe(false);
    }
  });
});

describe('buildRpcContext', () => {
  const client = {
    from: () => ({
      select() {
        const chain = {
          eq: () => chain,
          gte: () => chain,
          order: () => chain,
          limit: () => chain,
          then: (resolve) => Promise.resolve({ data: [], error: null }).then(resolve),
        };
        return chain;
      },
      insert: () => ({ then: (resolve) => Promise.resolve({ data: null, error: null }).then(resolve) }),
    }),
  };

  const admin = { kind: 'user', userId: 'u1', via: 'user_jwt' };
  const adminActor = { kind: 'user', userId: 'u1', role: 'admin' };
  const operatorActor = { kind: 'user', userId: 'u2', role: 'user' };

  it('refuses an internal caller on an admin tool, before the tool runs', async () => {
    const ctx = buildRpcContext({ caller: { kind: 'internal', userId: null, via: 'internal_key' }, client });
    const result = await ctx.call('axim_dispatch_task', { action: 'x' });

    // The service key bypasses RLS, so "internal" must not inherit the admin
    // rule `hitl_audit_logs` states. The tool's own admin_id check is a second
    // line of defence and is proven separately in `tests/mcp-tools.test.js`.
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('authorisation denied');
    expect(result.content[0].text).toContain('requires a user identity');
  });

  it('refuses a non-admin operator on an admin tool', async () => {
    const ctx = buildRpcContext({ caller: admin, actor: operatorActor, client });
    const result = await ctx.call('axim_dispatch_task', { action: 'Approve wire' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('requires role "admin"');
  });

  it('lets an admin stage a task', async () => {
    const ctx = buildRpcContext({ caller: admin, actor: adminActor, client });
    const result = await ctx.call('axim_dispatch_task', { action: 'Approve wire' });

    expect(result.isError).toBe(false);
  });

  it('defaults an actor-less context to read-only rather than to admin', async () => {
    // A wiring mistake must lose capability, not grant it.
    const ctx = buildRpcContext({ caller: admin, client });
    const result = await ctx.call('axim_dispatch_task', { action: 'x' });

    expect(result.isError).toBe(true);
  });

  it('maps an unknown tool to a -32602 fault rather than a tool error', async () => {
    const ctx = buildRpcContext({ caller: admin, client });

    await expect(ctx.call('not_a_tool', {})).rejects.toMatchObject({ code: -32602 });
  });

  it('advertises the admin tools to an admin', () => {
    const ctx = buildRpcContext({ caller: admin, actor: adminActor, client });
    expect(ctx.list().map((tool) => tool.name)).toContain('axim_dispatch_task');
  });

  it('hides the admin tools from a non-admin', () => {
    const ctx = buildRpcContext({ caller: admin, actor: operatorActor, client });
    const names = ctx.list().map((tool) => tool.name);

    expect(names).toContain('core_health_check');
    expect(names).not.toContain('axim_dispatch_task');
    expect(names).not.toContain('hitl_queue_status');
  });

  it('charges the write quota only on a mutating tool, and reports exhaustion as a tool error', async () => {
    const store = new MemoryQuotaStore();
    const ctx = buildRpcContext({
      caller: admin,
      actor: adminActor,
      client,
      quota: { store, now: () => NOW },
    });

    const charged = [];
    for (let i = 0; i < WRITE_QUOTA.limit + 1; i += 1) {
      charged.push(await ctx.call('axim_dispatch_task', { action: 'x' }));
    }

    expect(charged.slice(0, WRITE_QUOTA.limit).every((result) => result.isError === false)).toBe(true);
    const last = charged[charged.length - 1];
    expect(last.isError).toBe(true);
    expect(last.content[0].text).toContain('write quota exhausted');

    // A read tool is unaffected by an exhausted write budget.
    const read = await ctx.call('core_health_check', {});
    expect(read.isError).toBe(false);
  });
});

describe('messageEndpoint', () => {
  it('derives the Supabase path when no public origin is configured', () => {
    expect(
      messageEndpoint('https://pvbcdndqjguzqeafhwhw.supabase.co/functions/v1/mcp-sse', envFrom({})),
    ).toBe('https://pvbcdndqjguzqeafhwhw.supabase.co/functions/v1/mcp-message');
  });

  it('uses the worker route when MCP_PUBLIC_ORIGIN is set, because the worker does not route /functions/v1/*', () => {
    expect(
      messageEndpoint('https://pvbcdndqjguzqeafhwhw.supabase.co/functions/v1/mcp-sse', envFrom({
        MCP_PUBLIC_ORIGIN: 'https://core.axim.us.com/',
      })),
    ).toBe('https://core.axim.us.com/message');
  });
});

describe('sessionSecret', () => {
  it('returns the key when set and undefined when absent or blank', () => {
    expect(sessionSecret(envFrom({ AXIM_INTERNAL_KEY: 'k' }))).toBe('k');
    expect(sessionSecret(envFrom({ AXIM_INTERNAL_KEY: '' }))).toBeUndefined();
    expect(sessionSecret(envFrom({}))).toBeUndefined();
  });
});
