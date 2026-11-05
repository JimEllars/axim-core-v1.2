// @vitest-environment node
/**
 * Proving tests for `supabase/functions/_shared/mcpProtocol.ts`.
 *
 * The JSON-RPC rules that matter here are the ones a hand-rolled MCP server
 * usually breaks:
 *
 *   - a notification gets no response, even when it names an unknown method
 *     (answering one desynchronises a pipelining client);
 *   - a batch that mixes notifications and requests answers only the requests,
 *     and a batch that is entirely notifications is 204, not 200 with `[]`;
 *   - an unknown *tool* is `-32602` (bad request) while a tool that runs and
 *     fails is a successful response carrying `isError: true`;
 *   - the `id` comes back exactly as sent, including a string id and a null id.
 *
 * The context is a double, so these assert protocol behaviour and nothing about
 * the database.
 */
import { describe, expect, it, vi } from 'vitest';

import {
  MCP_PROTOCOL_VERSION,
  RPC_ERRORS,
  SERVER_NAME,
  SUPPORTED_PROTOCOL_VERSIONS,
  handleRpcPayload,
  isNotification,
  validateEnvelope,
} from '../supabase/functions/_shared/mcpProtocol.ts';

const TOOLS = [
  { name: 'core_health_check', description: 'health', inputSchema: { type: 'object', properties: {} } },
];

function createContext(overrides = {}) {
  const calls = [];
  return {
    calls,
    list: () => TOOLS,
    call: vi.fn(async (name, args) => {
      calls.push({ name, args });
      if (name === 'explodes') {
        // Tool-level failure: a result with isError, not a throw.
        return { content: [{ type: 'text', text: 'boom' }], isError: true };
      }
      return { content: [{ type: 'text', text: JSON.stringify({ ok: true }) }], isError: false };
    }),
    ...overrides,
  };
}

const post = (payload, ctx) => handleRpcPayload(JSON.stringify(payload), ctx);

describe('envelope validation', () => {
  it('accepts a well-formed request', () => {
    const checked = validateEnvelope({ jsonrpc: '2.0', id: 1, method: 'ping' });
    expect(checked.ok).toBe(true);
    expect(checked.request.method).toBe('ping');
  });

  it('rejects a non-object, a wrong version, and a missing method', () => {
    for (const candidate of [null, 42, 'ping', [], { id: 1, method: 'ping' }, { jsonrpc: '1.0', method: 'ping' }, { jsonrpc: '2.0' }]) {
      const checked = validateEnvelope(candidate);
      expect(checked.ok, `accepted ${JSON.stringify(candidate)}`).toBe(false);
      expect(checked.error.code).toBe(RPC_ERRORS.INVALID_REQUEST);
    }
  });

  it('rejects an id that is neither string, number nor null', () => {
    expect(validateEnvelope({ jsonrpc: '2.0', id: {}, method: 'ping' }).ok).toBe(false);
  });

  it('treats a missing id as a notification but an explicit null as a request', () => {
    expect(isNotification({ jsonrpc: '2.0', method: 'ping' })).toBe(true);
    expect(isNotification({ jsonrpc: '2.0', id: null, method: 'ping' })).toBe(false);
  });
});

describe('initialize', () => {
  it('answers with the version the client asked for when it is supported', async () => {
    const result = await post(
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } },
      createContext(),
    );

    expect(result.status).toBe(200);
    expect(result.body.result.protocolVersion).toBe('2024-11-05');
    expect(result.body.result.serverInfo.name).toBe(SERVER_NAME);
    expect(result.body.result.capabilities.tools.listChanged).toBe(false);
  });

  it('falls back to its own version for an unknown or absent request', async () => {
    const ctx = createContext();
    const future = await post(
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2099-01-01' } },
      ctx,
    );
    const absent = await post({ jsonrpc: '2.0', id: 2, method: 'initialize' }, ctx);

    expect(future.body.result.protocolVersion).toBe(MCP_PROTOCOL_VERSION);
    expect(absent.body.result.protocolVersion).toBe(MCP_PROTOCOL_VERSION);
    expect(SUPPORTED_PROTOCOL_VERSIONS).toContain(MCP_PROTOCOL_VERSION);
  });
});

describe('method routing', () => {
  it('answers ping with an empty result object', async () => {
    const result = await post({ jsonrpc: '2.0', id: 'abc', method: 'ping' }, createContext());
    expect(result.body).toEqual({ jsonrpc: '2.0', id: 'abc', result: {} });
  });

  it('lists tools', async () => {
    const result = await post({ jsonrpc: '2.0', id: 3, method: 'tools/list' }, createContext());
    expect(result.body.result.tools).toHaveLength(1);
    expect(result.body.result.tools[0].name).toBe('core_health_check');
  });

  it('calls a tool and passes the arguments through', async () => {
    const ctx = createContext();
    const result = await post(
      { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'core_health_check', arguments: { x: 1 } } },
      ctx,
    );

    expect(ctx.calls).toEqual([{ name: 'core_health_check', args: { x: 1 } }]);
    expect(result.body.result.isError).toBe(false);
  });

  it('defaults arguments to an empty object', async () => {
    const ctx = createContext();
    await post({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'core_health_check' } }, ctx);
    expect(ctx.calls[0].args).toEqual({});
  });

  it('returns a tool failure as a successful response with isError', async () => {
    const result = await post(
      { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'explodes' } },
      createContext(),
    );

    expect(result.status).toBe(200);
    expect(result.body.error).toBeUndefined();
    expect(result.body.result.isError).toBe(true);
  });

  it('rejects tools/call without a name, and with non-object arguments', async () => {
    const ctx = createContext();
    const noName = await post({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: {} }, ctx);
    const badArgs = await post(
      { jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'x', arguments: 'nope' } },
      ctx,
    );

    expect(noName.body.error.code).toBe(RPC_ERRORS.INVALID_PARAMS);
    expect(badArgs.body.error.code).toBe(RPC_ERRORS.INVALID_PARAMS);
    expect(ctx.calls).toHaveLength(0);
  });

  it('propagates a RpcFault from the tool layer as a JSON-RPC error', async () => {
    const { RpcFault } = await import('../supabase/functions/_shared/mcpProtocol.ts');
    const ctx = createContext({
      call: async () => {
        throw new RpcFault(RPC_ERRORS.INVALID_PARAMS, 'unknown tool: nope');
      },
    });

    const result = await post({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'nope' } }, ctx);
    expect(result.body.error).toEqual({ code: RPC_ERRORS.INVALID_PARAMS, message: 'unknown tool: nope' });
  });

  it('answers an unknown method with -32601 and keeps the id', async () => {
    const result = await post({ jsonrpc: '2.0', id: 10, method: 'resources/list' }, createContext());
    expect(result.body.error.code).toBe(RPC_ERRORS.METHOD_NOT_FOUND);
    expect(result.body.id).toBe(10);
  });

  it('converts a thrown non-fault into -32603 rather than a 500', async () => {
    const ctx = createContext({
      call: async () => {
        throw new Error('database on fire');
      },
    });
    const result = await post({ jsonrpc: '2.0', id: 11, method: 'tools/call', params: { name: 'x' } }, ctx);
    expect(result.body.error.code).toBe(RPC_ERRORS.INTERNAL);
    expect(result.body.error.message).toBe('database on fire');
  });
});

describe('notifications', () => {
  it('answers nothing at all, and 204 with no body', async () => {
    const ctx = createContext();
    const result = await post({ jsonrpc: '2.0', method: 'notifications/initialized' }, ctx);

    expect(result.status).toBe(204);
    expect(result.body).toBeNull();
    expect(ctx.call).not.toHaveBeenCalled();
  });

  it('stays silent for an unknown notification method, as JSON-RPC requires', async () => {
    const result = await post({ jsonrpc: '2.0', method: 'notifications/something_new' }, createContext());
    expect(result.status).toBe(204);
    expect(result.body).toBeNull();
  });
});

describe('parse and transport failures', () => {
  it('returns -32700 for a body that is not JSON', async () => {
    const result = await handleRpcPayload('{"jsonrpc":', createContext());
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe(RPC_ERRORS.PARSE);
    expect(result.body.id).toBeNull();
  });

  it('returns -32700 for an empty body', async () => {
    const result = await handleRpcPayload('   ', createContext());
    expect(result.body.error.code).toBe(RPC_ERRORS.PARSE);
  });

  it('returns -32600 for an empty batch', async () => {
    const result = await post([], createContext());
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe(RPC_ERRORS.INVALID_REQUEST);
  });
});

describe('batches', () => {
  it('answers each request in order and skips notifications', async () => {
    const ctx = createContext();
    const result = await post(
      [
        { jsonrpc: '2.0', id: 1, method: 'ping' },
        { jsonrpc: '2.0', method: 'notifications/initialized' },
        { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      ],
      ctx,
    );

    expect(result.status).toBe(200);
    expect(result.body).toHaveLength(2);
    expect(result.body.map((entry) => entry.id)).toEqual([1, 2]);
  });

  it('keeps a per-entry error inside a 200 batch', async () => {
    const result = await post(
      [
        { jsonrpc: '2.0', id: 1, method: 'ping' },
        { jsonrpc: '2.0', id: 2, method: 'nope' },
      ],
      createContext(),
    );

    expect(result.status).toBe(200);
    expect(result.body[0].result).toEqual({});
    expect(result.body[1].error.code).toBe(RPC_ERRORS.METHOD_NOT_FOUND);
  });

  it('reports an invalid envelope entry without aborting the batch', async () => {
    const result = await post(
      [{ jsonrpc: '1.0', id: 1, method: 'ping' }, { jsonrpc: '2.0', id: 2, method: 'ping' }],
      createContext(),
    );

    expect(result.status).toBe(200);
    expect(result.body[0].error.code).toBe(RPC_ERRORS.INVALID_REQUEST);
    expect(result.body[0].id).toBeNull();
    expect(result.body[1].result).toEqual({});
  });

  it('returns 204 when a batch contains only notifications', async () => {
    const result = await post([{ jsonrpc: '2.0', method: 'notifications/initialized' }], createContext());
    expect(result.status).toBe(204);
    expect(result.body).toBeNull();
  });
});
