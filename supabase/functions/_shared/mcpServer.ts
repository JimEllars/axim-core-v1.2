/**
 * Shared wiring for the three MCP Edge Functions.
 *
 * `mcp-router`, `mcp-sse` and `mcp-message` differ only in transport: the first
 * answers JSON-RPC over POST, the second opens the SSE stream, the third carries
 * a session id on follow-up messages. The authorisation decision, the tool
 * context and the error mapping are identical, and three copies of an auth rule
 * is how the surfaces drift apart — so they live here.
 *
 * This module does depend on `Deno.env`-shaped input, but only through an
 * injected `{ get }` interface, so the pieces that can be wrong (who is allowed
 * in, and how a tool fault becomes a JSON-RPC error) are testable under Node.
 */

import { classifyEdgeCaller, classifyDepsFromEnv } from "./edgeCaller.ts";
import { RPC_ERRORS, RpcFault, type RpcContext } from "./mcpProtocol.ts";
import type { ToolActor } from "./mcpTools.ts";
import { callTool, listTools, toolNames, UnknownToolError } from "./mcpTools.ts";
import { createDataAccess, type SupabaseLike } from "./mcpSupabase.ts";
import {
  actorFromCaller,
  decideToolCall,
  policyFor,
  visibleTools,
  type McpActor,
} from "./mcpAuthz.ts";
import { chargeWriteQuota, type QuotaStore } from "./mcpQuota.ts";

export interface EnvLike {
  get(key: string): string | undefined;
}

export interface CallerSummary {
  kind: "internal" | "user";
  userId: string | null;
  via: string;
}

export type Authorisation =
  | { ok: true; caller: CallerSummary }
  | { ok: false; status: 401; reason: string };

export const UNAUTHENTICATED_MESSAGE =
  "authentication required: present a verified user token, the internal service key, or a signed relay";

/**
 * Decide whether a caller may use the MCP surface.
 *
 * Every MCP route refuses anonymous callers, including `initialize` and the
 * discovery document. This is the same posture as the rest of Core's AI surface:
 * an open MCP endpoint is an open query interface onto telemetry, HITL approvals
 * and the satellite registry, and a tool inventory is itself useful to an
 * attacker mapping the deployment.
 *
 * A presented-but-invalid `X-Axim-Signature` is terminal inside
 * `classifyEdgeCaller`; this function only surfaces the outcome.
 */
export async function authoriseMcpCaller(params: {
  headers: Headers;
  rawBody: string;
  env: EnvLike;
  verifyUser?: (token: string) => Promise<string | null>;
  nowMs?: number;
}): Promise<Authorisation> {
  const deps = classifyDepsFromEnv(params.env);
  const caller = await classifyEdgeCaller(params.headers, params.rawBody, {
    ...deps,
    nowMs: params.nowMs,
    verifyUser: params.verifyUser,
  });

  if (caller.kind === "anonymous") {
    return {
      ok: false,
      status: 401,
      reason: caller.rejection
        ? `signature rejected (${caller.rejection})`
        : UNAUTHENTICATED_MESSAGE,
    };
  }

  return {
    ok: true,
    caller: { kind: caller.kind, userId: caller.userId, via: caller.via },
  };
}

export interface BuildContextParams {
  caller: CallerSummary;
  client: SupabaseLike;
  now?: () => number;
  probeTable?: string;
  /**
   * The caller plus their resolved `public.users.role`. Entrypoints build this
   * with `resolveMcpActor` before calling here. Omitting it is safe but
   * read-only: `actorFromCaller` defaults the role to `null`, which satisfies no
   * admin-scope tool, so a missed wiring step loses capability rather than
   * granting it.
   */
  actor?: McpActor;
  /** Write quota overrides. `null` disables the write charge (tests only). */
  quota?: { store?: QuotaStore; now?: () => number } | null;
}

/**
 * Assemble an `RpcContext` for one request.
 *
 * Two rules are enforced here rather than in the tools, so a tool cannot be
 * written without them: `list()` shows only the descriptors this actor may call,
 * and `call()` refuses a tool the actor may not call *before* the tool runs. The
 * registry itself is injected unchanged.
 */
export function buildRpcContext(params: BuildContextParams): RpcContext {
  const { caller, client } = params;
  const now = params.now ?? Date.now;
  const actor = params.actor ?? actorFromCaller(caller);
  const quota = params.quota === null ? null : (params.quota ?? {});
  const registered = new Set(toolNames());
  const data = createDataAccess(client, {
    probeTable: params.probeTable,
    now: () => now(),
  });
  const toolActor: ToolActor = {
    kind: caller.kind,
    userId: caller.kind === "user" ? caller.userId : null,
  };

  return {
    list: () => visibleTools(listTools(), actor),
    call: async (name: string, args: Record<string, unknown>) => {
      const policy = policyFor(name);

      // An unregistered name is the caller's mistake and stays -32602. A
      // registered tool with no policy is ours, and it is refused rather than
      // executed — the failure mode is "cannot use it", not "anyone can".
      if (!policy && registered.has(name)) {
        return {
          content: [
            {
              type: "text",
              text: `tool "${name}" has no authorisation policy; refusing by default`,
            },
          ],
          isError: true,
        };
      }

      if (policy) {
        const decision = decideToolCall(name, actor);
        if (!decision.ok) {
          return { content: [{ type: "text", text: `authorisation denied: ${decision.reason}` }], isError: true };
        }

        if (policy.mutating && quota) {
          const outcome = chargeWriteQuota(caller, quota);
          if (!outcome.allowed) {
            return {
              content: [
                {
                  type: "text",
                  text: `write quota exhausted: ${outcome.limit} mutating calls per window; retry in ${outcome.retryAfterSeconds}s`,
                },
              ],
              isError: true,
            };
          }
        }
      }

      try {
        return await callTool(name, args, { actor: toolActor, data, now });
      } catch (error) {
        // An unknown tool is a malformed request, not a failed execution. MCP
        // clients distinguish the two: -32602 means "your call was wrong",
        // while `isError: true` means "the tool ran and hit a problem".
        if (error instanceof UnknownToolError) {
          throw new RpcFault(RPC_ERRORS.INVALID_PARAMS, error.message);
        }
        throw error;
      }
    },
  };
}

/** The signing key for MCP sessions. Absent means the surface cannot serve. */
export function sessionSecret(env: EnvLike): string | undefined {
  const value = env.get("AXIM_INTERNAL_KEY");
  return value && value.length > 0 ? value : undefined;
}

/**
 * URL a client should use for follow-up messages.
 *
 * There are two legitimate front doors and they do **not** share a path, which
 * is why this branches instead of substituting a hostname:
 *
 *   - direct to Supabase: `<origin>/functions/v1/mcp-message`
 *   - through the Cloudflare worker: `<origin>/message` — the worker's `apiRoutes`
 *     proxies `/message`, and it does *not* route `/functions/v1/mcp-message`, so
 *     handing a client the Supabase-shaped path behind the worker produces a URL
 *     that 404s at the asset handler.
 *
 * `MCP_PUBLIC_ORIGIN` (e.g. `https://core.axim.us.com`) selects the worker form.
 */
export function messageEndpoint(requestUrl: string, env: EnvLike): string {
  const configured = env.get("MCP_PUBLIC_ORIGIN");
  if (configured && configured.length > 0) {
    return `${configured.replace(/\/+$/, "")}/message`;
  }
  return `${new URL(requestUrl).origin}/functions/v1/mcp-message`;
}
