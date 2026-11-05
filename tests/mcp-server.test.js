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

  it('narrows an internal caller to a null user id', async () => {
    const ctx = buildRpcContext({ caller: { kind: 'internal', userId: null, via: 'internal_key' }, client });
    const result = await ctx.call('axim_dispatch_task', { action: 'x' });

    // Refused by the tool, because hitl_audit_logs.admin_id needs a real user.
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('requires a verified user caller');
  });

  it('maps an unknown tool to a -32602 fault rather than a tool error', async () => {
    const ctx = buildRpcContext({ caller: { kind: 'user', userId: 'u1', via: 'user_jwt' }, client });

    await expect(ctx.call('not_a_tool', {})).rejects.toMatchObject({ code: -32602 });
  });

  it('lists the registry unchanged', () => {
    const ctx = buildRpcContext({ caller: { kind: 'user', userId: 'u1', via: 'user_jwt' }, client });
    expect(ctx.list().map((tool) => tool.name)).toContain('core_health_check');
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
