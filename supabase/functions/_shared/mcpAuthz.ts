/**
 * Per-tool authorisation for the AXiM Core MCP surface.
 *
 * Wave 131 gated the surface on *whether* a caller is authenticated and stopped
 * there: any verified user could call every tool, including `axim_dispatch_task`,
 * which stages work in the human approval queue. That is not the rule the schema
 * states. `public.hitl_audit_logs` restricts SELECT and INSERT to
 * `public.users.role = 'admin'`, but the MCP tools write through the **service
 * role** client, and a service key bypasses RLS entirely — so the tool was the
 * only gate, and it was open. This module closes it, and takes the rule from the
 * migration rather than inventing a new one.
 *
 * Two properties are load-bearing:
 *
 *   1. **Every tool declares a policy, or it cannot run.** `decideToolCall`
 *      refuses an unpolicied tool instead of defaulting to allow, and
 *      `tests/mcp-authz.test.js` asserts the registry and this table agree, so a
 *      tool added later cannot quietly inherit "anyone may call this".
 *   2. **Role resolution fails closed.** `resolveActorRole` returns `null` when
 *      `public.users` has no row for the caller *or the lookup itself errored*;
 *      `null` satisfies no admin-scope tool. A database hiccup denies a write
 *      rather than promoting a caller.
 *
 * No `Deno.*`, no Supabase import: the data adapter is injected, so this module
 * is unit tested under Node and runs unchanged on Supabase Edge.
 */

import type { CallerKind } from "./edgeAuth.ts";
import type { McpDataAccess, ToolDescriptor } from "./mcpTools.ts";

// ---------------------------------------------------------------------------
// Contracts
// ---------------------------------------------------------------------------

/**
 * `mcp:read` — any authenticated caller, user or internal. Matches the schema:
 * `ecosystem_nodes` grants read to all authenticated users.
 *
 * `mcp:admin` — a verified *user* whose `public.users.role` is `admin`. An
 * internal caller is refused even though it holds the service key: the tools
 * run as the service role, so "internal" would mean "bypasses RLS", and a
 * relay with that power is a bigger grant than the table was designed to allow.
 */
export type McpScope = "mcp:read" | "mcp:admin";

export interface ToolPolicy {
  scope: McpScope;
  /** True when the tool writes. Write calls are also charged against the write quota. */
  mutating: boolean;
  /** The schema fact the rule comes from, so the next reader can check it. */
  basis: string;
}

/**
 * The policy table. Every name in `TOOL_DESCRIPTORS` must appear here; there is
 * deliberately no wildcard default.
 */
export const TOOL_POLICIES: Readonly<Record<string, ToolPolicy>> = Object.freeze({
  core_health_check: {
    scope: "mcp:read",
    mutating: false,
    basis: "times a `select id from telemetry_events limit 1` probe; writes nothing",
  },
  telemetry_lookup: {
    scope: "mcp:read",
    mutating: false,
    basis: "reads public.telemetry_events, which has no RLS and no owner column to scope by",
  },
  hitl_queue_status: {
    scope: "mcp:admin",
    mutating: false,
    basis:
      "public.hitl_audit_logs grants SELECT only to `public.users.role = 'admin'` (20251101000000, rewritten by 20281031000000); the tool reads with the service key, which bypasses that check",
  },
  axim_list_nodes: {
    scope: "mcp:read",
    mutating: false,
    basis: "public.ecosystem_nodes grants read to all authenticated users (20270301000000)",
  },
  axim_dispatch_task: {
    scope: "mcp:admin",
    mutating: true,
    basis:
      "public.hitl_audit_logs grants INSERT only to `public.users.role = 'admin'` (20251101000000); a staged approval asks an admin to sign off, so a non-admin must not be able to queue one",
  },
});

export type McpRole = "admin" | "user";

export interface McpActor {
  kind: CallerKind;
  userId: string | null;
  /**
   * `public.users.role` for a user caller. `null` means "no profile row, or the
   * lookup failed" — never "admin".
   */
  role: McpRole | null;
}

export interface ToolDenial {
  ok: false;
  tool: string;
  scope: McpScope | "unknown";
  reason: string;
}

export type ToolDecision = { ok: true } | ToolDenial;

/** Columns of `public.users` this module reads (`20250101000000_consolidated_schema.sql`). */
export const USERS_TABLE = "users";
export const USERS_COLUMNS = "id,role";

// ---------------------------------------------------------------------------
// Policy lookup
// ---------------------------------------------------------------------------

export function policyFor(tool: string): ToolPolicy | null {
  // `Object.freeze` stops the table being mutated; `hasOwnProperty` keeps a
  // method name like `constructor` from resolving through the prototype.
  if (!Object.prototype.hasOwnProperty.call(TOOL_POLICIES, tool)) return null;
  return TOOL_POLICIES[tool];
}

/** Registered tools that have no policy. Empty is the only healthy value. */
export function unpoliciedTools(names: readonly string[]): string[] {
  return names.filter((name) => policyFor(name) === null);
}

// ---------------------------------------------------------------------------
// Decision
// ---------------------------------------------------------------------------

function denial(tool: string, scope: McpScope | "unknown", reason: string): ToolDenial {
  return { ok: false, tool, scope, reason };
}

/**
 * May this actor call this tool?
 *
 * Restated per scope rather than table-driven, because each branch carries a
 * different justification and merging them loses it.
 */
export function decideToolCall(tool: string, actor: McpActor): ToolDecision {
  const policy = policyFor(tool);
  if (!policy) {
    return denial(
      tool,
      "unknown",
      `tool "${tool}" has no authorisation policy; the MCP surface refuses unpolicied tools by default`,
    );
  }

  if (actor.kind === "anonymous") {
    return denial(tool, policy.scope, "authentication required: anonymous callers are refused on every tool");
  }

  if (policy.scope === "mcp:read") return { ok: true };

  // mcp:admin
  if (actor.kind !== "user" || !actor.userId) {
    return denial(
      tool,
      policy.scope,
      `tool "${tool}" is admin-only and requires a user identity; an internal or relay caller holds no public.users row to attribute or authorise`,
    );
  }

  if (actor.role !== "admin") {
    return denial(
      tool,
      policy.scope,
      `tool "${tool}" requires role "admin"; this caller resolves to role ${actor.role === null ? "null" : `"${actor.role}"`}`,
    );
  }

  return { ok: true };
}

/** The descriptors this actor may call, for `tools/list` and the discovery document. */
export function visibleTools(tools: readonly ToolDescriptor[], actor: McpActor): ToolDescriptor[] {
  return tools.filter((tool) => decideToolCall(tool.name, actor).ok);
}

// ---------------------------------------------------------------------------
// Role resolution
// ---------------------------------------------------------------------------

/** A caller summary as produced by `authoriseMcpCaller`. */
export interface CallerLike {
  kind: CallerKind;
  userId: string | null;
}

/**
 * Read the caller's role from `public.users`.
 *
 * Returns `null` — the least privileged answer — when there is no user id, no
 * profile row, or the query failed. The tools run as the service role, so this
 * is the only place the RLS rule on `hitl_audit_logs` can be enforced at all.
 */
export async function resolveActorRole(
  data: Pick<McpDataAccess, "select">,
  userId: string | null,
): Promise<McpRole | null> {
  if (!userId) return null;

  const outcome = await data.select(USERS_TABLE, {
    columns: USERS_COLUMNS,
    filters: [["id", "eq", userId]],
    limit: 1,
  });
  if (outcome.error) return null;

  const role = outcome.data?.[0]?.role;
  return role === "admin" || role === "user" ? role : null;
}

/**
 * Build the actor for one request: the caller plus their resolved role.
 *
 * A user caller costs exactly one extra indexed primary-key read; an internal
 * caller costs none, because an internal caller can never satisfy `mcp:admin`.
 */
export async function resolveMcpActor(params: {
  caller: CallerLike;
  data: Pick<McpDataAccess, "select">;
}): Promise<McpActor> {
  const role = await resolveActorRole(params.data, params.caller.userId);
  return { kind: params.caller.kind, userId: params.caller.userId, role };
}

/** Actor for a caller whose role has not been looked up: read-only by construction. */
export function actorFromCaller(caller: CallerLike, role: McpRole | null = null): McpActor {
  return { kind: caller.kind, userId: caller.userId, role };
}
