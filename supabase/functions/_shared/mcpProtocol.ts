/**
 * JSON-RPC 2.0 envelope handling for the AXiM Core MCP server.
 *
 * Three routes in `cloudflare-workers/src/index.js` point here and had no
 * implementation behind them:
 *
 *     /mcp, /api/v1/mcp              -> functions/v1/mcp-router
 *     /sse, /api/v1/mcp/sse          -> functions/v1/mcp-sse
 *     /message, /api/v1/mcp/message  -> functions/v1/mcp-message
 *
 * All six answered Supabase's 404. `tests/edge-routes.test.js` named them in
 * `NOT_YET_BUILT` so the gap was written down rather than assumed — building
 * them forces the allowlist entry out.
 *
 * What this module is responsible for, and what it is not:
 *
 *   - It is the *protocol* half: parse, validate the envelope, route a method,
 *     and shape the response. It decides nothing about who is calling; that is
 *     `edgeCaller.ts`, and the entrypoints call it before this module runs.
 *   - It never touches `Deno.*`, Supabase or the network. The two collaborators
 *     (list the tools, call a tool) are injected, so this file is unit tested
 *     under Vitest/Node and runs unchanged on Supabase Edge.
 *
 * Notification semantics are load-bearing and easy to get wrong: JSON-RPC
 * forbids a response to a message with no `id`, including one naming a method
 * the server does not implement. A server that answers them desynchronises
 * every client that pipelines requests.
 */

import type { ToolDescriptor, ToolCallResult } from "./mcpTools.ts";

export const MCP_PROTOCOL_VERSION = "2025-06-18";

/**
 * Versions we accept on `initialize`. All three specify the same shape for
 * `initialize` / `ping` / `tools/list` / `tools/call`, which is the whole of
 * this server's surface, so advertising all three is accurate rather than
 * optimistic. A client asking for anything else is answered with ours and is
 * expected to disconnect (MCP: the server replies with the version it supports).
 */
export const SUPPORTED_PROTOCOL_VERSIONS = [
  "2025-06-18",
  "2025-03-26",
  "2024-11-05",
] as const;

export const SERVER_NAME = "axim-core-mcp";
export const SERVER_VERSION = "1.0.0";

/** JSON-RPC 2.0 error codes (section 5.1) plus the MCP-documented -32002. */
export const RPC_ERRORS = {
  PARSE: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL: -32603,
} as const;

export type RpcId = string | number | null;

export interface RpcRequest {
  jsonrpc: "2.0";
  id?: RpcId;
  method: string;
  params?: unknown;
}

export interface RpcErrorBody {
  code: number;
  message: string;
  data?: unknown;
}

/** A dispatch failure that must surface as a JSON-RPC error object. */
export class RpcFault extends Error {
  readonly code: number;
  readonly data?: unknown;

  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.name = "RpcFault";
    this.code = code;
    this.data = data;
  }
}

export interface RpcContext {
  /** Tool descriptors for `tools/list`. */
  list: () => ToolDescriptor[];
  /** Executes one tool; rejects only on a protocol-level fault. */
  call: (name: string, args: Record<string, unknown>) => Promise<ToolCallResult>;
  /** Injected clock, so `initialize` is deterministic in tests. */
  now?: () => number;
}

export type EnvelopeCheck =
  | { ok: true; request: RpcRequest }
  | { ok: false; error: RpcErrorBody };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validate a single JSON-RPC request object.
 *
 * `id` is optional: absent means notification. An explicit `null` id is treated
 * as a *request* with a null id (the spec discourages minting null ids but the
 * server must still answer them), which is why the check is for `undefined`
 * rather than falsiness.
 */
export function validateEnvelope(value: unknown): EnvelopeCheck {
  if (!isPlainObject(value)) {
    return {
      ok: false,
      error: { code: RPC_ERRORS.INVALID_REQUEST, message: "request must be a JSON object" },
    };
  }

  if (value.jsonrpc !== "2.0") {
    return {
      ok: false,
      error: {
        code: RPC_ERRORS.INVALID_REQUEST,
        message: 'request must declare jsonrpc: "2.0"',
      },
    };
  }

  if (typeof value.method !== "string" || value.method.trim().length === 0) {
    return {
      ok: false,
      error: { code: RPC_ERRORS.INVALID_REQUEST, message: "request must name a method" },
    };
  }

  if (
    "id" in value &&
    value.id !== null &&
    typeof value.id !== "string" &&
    typeof value.id !== "number"
  ) {
    return {
      ok: false,
      error: {
        code: RPC_ERRORS.INVALID_REQUEST,
        message: "id must be a string, a number or null",
      },
    };
  }

  return { ok: true, request: value as unknown as RpcRequest };
}

/** True when the request carries no id, i.e. must not be answered. */
export function isNotification(request: RpcRequest): boolean {
  return request.id === undefined;
}

function negotiateVersion(requested: unknown): string {
  if (typeof requested === "string") {
    const supported = SUPPORTED_PROTOCOL_VERSIONS as readonly string[];
    if (supported.includes(requested)) return requested;
  }
  return MCP_PROTOCOL_VERSION;
}

/**
 * Handle one validated method call. Returns `null` for notifications.
 *
 * Tool *execution* failures come back from `ctx.call` as a result with
 * `isError: true` — that is the MCP contract, and a client shows it to a model
 * rather than treating the request as malformed. Only faults in the request
 * itself become JSON-RPC errors.
 */
async function dispatchMethod(
  request: RpcRequest,
  ctx: RpcContext,
): Promise<RpcResponseish | null> {
  if (isNotification(request)) {
    // No side effects are attached to any notification we accept today
    // (`notifications/initialized`, `notifications/cancelled`). Swallow them and
    // stay silent even for methods we do not know, because answering a
    // notification at all is a protocol violation.
    return null;
  }

  const id = request.id as RpcId;

  switch (request.method) {
    case "initialize":
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: negotiateVersion(
            isPlainObject(request.params) ? request.params.protocolVersion : undefined,
          ),
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        },
      };

    case "ping":
      return { jsonrpc: "2.0", id, result: {} };

    case "tools/list":
      return { jsonrpc: "2.0", id, result: { tools: ctx.list() } };

    case "tools/call": {
      const params = request.params;
      if (!isPlainObject(params)) {
        throw new RpcFault(RPC_ERRORS.INVALID_PARAMS, "tools/call requires a params object");
      }
      const name = params.name;
      if (typeof name !== "string" || name.trim().length === 0) {
        throw new RpcFault(RPC_ERRORS.INVALID_PARAMS, "tools/call requires params.name");
      }
      const args = params.arguments === undefined ? {} : params.arguments;
      if (!isPlainObject(args)) {
        throw new RpcFault(RPC_ERRORS.INVALID_PARAMS, "params.arguments must be an object");
      }
      const result = await ctx.call(name, args as Record<string, unknown>);
      return { jsonrpc: "2.0", id, result };
    }

    default:
      throw new RpcFault(
        RPC_ERRORS.METHOD_NOT_FOUND,
        `method not found: ${request.method}`,
      );
  }
}

interface RpcSuccess {
  jsonrpc: "2.0";
  id: RpcId;
  result: unknown;
}

interface RpcFailure {
  jsonrpc: "2.0";
  id: RpcId;
  error: RpcErrorBody;
}

export type RpcResponseish = RpcSuccess | RpcFailure;

function errorResponse(id: RpcId, error: RpcErrorBody): RpcFailure {
  return { jsonrpc: "2.0", id, error };
}

/**
 * Dispatch a single request, converting faults into error responses.
 *
 * Exported because `handleRpcPayload` needs the same behaviour for each member
 * of a batch and for the single-message case; duplicating it is how batch and
 * non-batch paths drift apart.
 */
export async function dispatchRequest(
  request: RpcRequest,
  ctx: RpcContext,
): Promise<RpcResponseish | null> {
  try {
    return await dispatchMethod(request, ctx);
  } catch (error) {
    if (isNotification(request)) return null;
    const id = request.id as RpcId;
    if (error instanceof RpcFault) {
      return errorResponse(id, { code: error.code, message: error.message, data: error.data });
    }
    const message = error instanceof Error ? error.message : String(error);
    return errorResponse(id, { code: RPC_ERRORS.INTERNAL, message });
  }
}

export interface RpcHandling {
  /** HTTP status the entrypoint should send. */
  status: number;
  /** Null means "204 No Content" — every message was a notification. */
  body: unknown | null;
}

/**
 * Parse and handle a raw request body.
 *
 * Batches are supported because the MCP Streamable HTTP transport allows a
 * client to POST an array. An empty array is an invalid request, not an empty
 * success (JSON-RPC 2.0 section 6).
 */
export async function handleRpcPayload(
  raw: unknown,
  ctx: RpcContext,
): Promise<RpcHandling> {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return {
      status: 400,
      body: errorResponse(null, { code: RPC_ERRORS.PARSE, message: "empty request body" }),
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      status: 400,
      body: errorResponse(null, { code: RPC_ERRORS.PARSE, message: "request body is not valid JSON" }),
    };
  }

  if (Array.isArray(parsed)) {
    if (parsed.length === 0) {
      return {
        status: 400,
        body: errorResponse(null, {
          code: RPC_ERRORS.INVALID_REQUEST,
          message: "batch must contain at least one request",
        }),
      };
    }

    const responses: RpcResponseish[] = [];
    for (const entry of parsed) {
      const checked = validateEnvelope(entry);
      if (!checked.ok) {
        responses.push(errorResponse(null, checked.error));
        continue;
      }
      const response = await dispatchRequest(checked.request, ctx);
      if (response) responses.push(response);
    }

    if (responses.length === 0) return { status: 204, body: null };
    // A batch that mixes successes and failures is still a 200: the per-entry
    // error objects carry the outcome. Only a wholly unparseable body is 400.
    return { status: 200, body: responses };
  }

  const checked = validateEnvelope(parsed);
  if (!checked.ok) {
    return { status: 400, body: errorResponse(null, checked.error) };
  }

  const response = await dispatchRequest(checked.request, ctx);
  if (!response) return { status: 204, body: null };
  return { status: 200, body: response };
}
