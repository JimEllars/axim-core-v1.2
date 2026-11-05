/**
 * Tool registry for the AXiM Core MCP server.
 *
 * The Cloudflare MCP bridge (`cloudflare-workers/mcp-bridge`) already exposes a
 * set of tools, but it queries columns that do not exist in this database:
 * `axim_dispatch_task` inserts `action_name`, `payload`, `requested_by` and
 * `created_at` into `public.hitl_audit_logs`, whose actual columns are
 * `admin_id`, `action`, `tool_called`, `status`, `target_department` and
 * `timestamp`; `hitl_queue_status` selects `action_name` and compares `status`
 * against lowercase `'pending'` when the migration's default is `'Pending'`.
 * Every one of those calls is a PostgREST 400, and the bridge reports it as a
 * generic tool error.
 *
 * The definitions here are taken from the migrations rather than from the
 * bridge, so a caller gets either data or a specific message — never a
 * silently-empty result.
 *
 * Everything is injected through `ToolContext` (no `Deno.*`, no Supabase
 * import), which is what lets `tests/mcp-tools.test.js` drive these against a
 * fake data source and prove the column contracts.
 */

import type { CallerKind } from "./edgeAuth.ts";

// ---------------------------------------------------------------------------
// Contracts
// ---------------------------------------------------------------------------

export interface ToolResultContent {
  type: "text";
  text: string;
}

export interface ToolCallResult {
  content: ToolResultContent[];
  isError: boolean;
}

export interface JsonSchema {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface ToolDescriptor {
  name: string;
  description: string;
  inputSchema: JsonSchema;
}

/** Filter operators the data adapter must support. */
export type FilterOp = "eq" | "gte";

export type Filter = [column: string, op: FilterOp, value: unknown];

export interface SelectSpec {
  columns: string;
  filters?: Filter[];
  order?: { column: string; ascending: boolean };
  limit?: number;
}

export interface QueryOutcome {
  data: Record<string, unknown>[] | null;
  error: { message: string; code?: string } | null;
}

export interface ProbeOutcome {
  ok: boolean;
  latencyMs: number;
  detail?: string;
}

/**
 * The only database surface these tools may use. Deliberately narrow: a single
 * parameterised read and a single insert, so a tool cannot quietly grow a
 * `rpc` call or an unbounded table scan that the tests would not see.
 */
export interface McpDataAccess {
  select(table: string, spec: SelectSpec): Promise<QueryOutcome>;
  insert(table: string, row: Record<string, unknown>): Promise<{ error: { message: string } | null }>;
  /** Times a trivial round trip; used by `core_health_check`. */
  probe(): Promise<ProbeOutcome>;
}

export interface ToolActor {
  kind: CallerKind;
  userId: string | null;
}

export interface ToolContext {
  actor: ToolActor;
  data: McpDataAccess;
  now?: () => number;
}

// ---------------------------------------------------------------------------
// Table column contracts, mirrored from the migrations
// ---------------------------------------------------------------------------

/** `20280108000000_telemetry_performance_indices.sql` */
export const TELEMETRY_COLUMNS = "id,app_id,event_type,metadata,created_at";
export const TELEMETRY_TABLE = "telemetry_events";

/**
 * `20251101000000_create_hitl_audit_logs.sql` plus `20260404` (status) and
 * `20280106` (target_department). `ticket_id` and `action_required` are added by
 * guarded blocks that can be skipped, so they are not selected here.
 */
export const HITL_TABLE = "hitl_audit_logs";
export const HITL_COLUMNS = "id,action,tool_called,status,target_department,timestamp";
/** The migration default is capitalised; the bridge compared against 'pending'. */
export const HITL_PENDING_STATUS = "Pending";

/** `20270301000000_ecosystem_nodes.sql` plus `20280107` additions. */
export const NODES_TABLE = "ecosystem_nodes";
export const NODES_COLUMNS =
  "id,app_name,status,health_endpoint_url,last_ping,node_id,name,endpoint,node_type,last_heartbeat";

export const DEFAULT_LOOKUP_LIMIT = 5;
/** Bounds a single tool call so one request cannot pull the whole table. */
export const MAX_LOOKUP_LIMIT = 50;

// ---------------------------------------------------------------------------
// Result helpers
// ---------------------------------------------------------------------------

function text(payload: unknown): ToolCallResult {
  return {
    content: [{ type: "text", text: typeof payload === "string" ? payload : JSON.stringify(payload) }],
    isError: false,
  };
}

function failure(message: string): ToolCallResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

function boundedLimit(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_LOOKUP_LIMIT;
  const floored = Math.floor(value);
  if (floored < 1) return 1;
  return Math.min(floored, MAX_LOOKUP_LIMIT);
}

type OptionalString = { ok: true; value: string | null } | { ok: false; error: string };

/** Trimmed string, or null when absent/blank. Never throws; callers branch. */
function optionalString(value: unknown, field: string): OptionalString {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false, error: `${field} must be a string` };
  const trimmed = value.trim();
  if (trimmed.length === 0) return { ok: true, value: null };
  if (trimmed.length > 200) {
    return { ok: false, error: `${field} must be 200 characters or fewer` };
  }
  return { ok: true, value: trimmed };
}

// ---------------------------------------------------------------------------
// Tool descriptors
// ---------------------------------------------------------------------------

export const TOOL_DESCRIPTORS: ToolDescriptor[] = [
  {
    name: "core_health_check",
    description:
      "Times a round trip to the Core database and reports overall reachability. Read-only.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "telemetry_lookup",
    description:
      "Reads recent rows from public.telemetry_events, optionally filtered by app_id and event_type. Read-only.",
    inputSchema: {
      type: "object",
      properties: {
        app_id: { type: "string", description: "e.g. speedreport, onyx" },
        event_type: { type: "string", description: "e.g. speed_test_completed" },
        limit: {
          type: "number",
          description: `1-${MAX_LOOKUP_LIMIT}, default ${DEFAULT_LOOKUP_LIMIT}`,
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "hitl_queue_status",
    description:
      "Lists pending human-in-the-loop approvals from public.hitl_audit_logs. Read-only.",
    inputSchema: {
      type: "object",
      properties: {
        target_department: { type: "string", description: "e.g. CFO, CORE" },
        limit: {
          type: "number",
          description: `1-${MAX_LOOKUP_LIMIT}, default ${DEFAULT_LOOKUP_LIMIT}`,
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "axim_list_nodes",
    description:
      "Lists ecosystem satellites from public.ecosystem_nodes with status and last heartbeat. Read-only.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", description: "e.g. operational, degraded" },
        limit: {
          type: "number",
          description: `1-${MAX_LOOKUP_LIMIT}, default ${DEFAULT_LOOKUP_LIMIT}`,
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "axim_dispatch_task",
    description:
      "Stages a task in the Core HITL approval queue for operator sign-off. Requires a verified user caller. Does not execute anything.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", description: "What the operator should approve" },
        target_department: { type: "string", description: "e.g. CORE, CFO" },
        tool_called: { type: "string", description: "Originating tool, if any" },
      },
      required: ["action"],
      additionalProperties: false,
    },
  },
];

export function listTools(): ToolDescriptor[] {
  // Copy so a caller cannot mutate the registry through the returned array.
  return TOOL_DESCRIPTORS.map((tool) => ({ ...tool }));
}

export function toolNames(): string[] {
  return TOOL_DESCRIPTORS.map((tool) => tool.name);
}

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

async function coreHealthCheck(ctx: ToolContext): Promise<ToolCallResult> {
  const probe = await ctx.data.probe();
  return text({
    status: probe.ok ? "healthy" : "degraded",
    latency_ms: probe.latencyMs,
    timestamp: new Date((ctx.now ?? Date.now)()).toISOString(),
    ...(probe.detail ? { detail: probe.detail } : {}),
  });
}

async function telemetryLookup(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolCallResult> {
  const appId = optionalString(args.app_id, "app_id");
  if (!appId.ok) return failure(appId.error);
  const eventType = optionalString(args.event_type, "event_type");
  if (!eventType.ok) return failure(eventType.error);

  const filters: Filter[] = [];
  if (appId.value) filters.push(["app_id", "eq", appId.value]);
  if (eventType.value) filters.push(["event_type", "eq", eventType.value]);

  const outcome = await ctx.data.select(TELEMETRY_TABLE, {
    columns: TELEMETRY_COLUMNS,
    filters,
    order: { column: "created_at", ascending: false },
    limit: boundedLimit(args.limit),
  });
  if (outcome.error) return failure(`telemetry_events query failed: ${outcome.error.message}`);

  const events = outcome.data ?? [];
  return text({ events, count: events.length });
}

async function hitlQueueStatus(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolCallResult> {
  const department = optionalString(args.target_department, "target_department");
  if (!department.ok) return failure(department.error);

  const filters: Filter[] = [["status", "eq", HITL_PENDING_STATUS]];
  if (department.value) filters.push(["target_department", "eq", department.value]);

  const outcome = await ctx.data.select(HITL_TABLE, {
    columns: HITL_COLUMNS,
    filters,
    order: { column: "timestamp", ascending: false },
    limit: boundedLimit(args.limit),
  });
  if (outcome.error) return failure(`hitl_audit_logs query failed: ${outcome.error.message}`);

  const items = outcome.data ?? [];
  return text({ pending_approvals: items.length, items });
}

async function listNodes(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolCallResult> {
  const status = optionalString(args.status, "status");
  if (!status.ok) return failure(status.error);

  const filters: Filter[] = [];
  if (status.value) filters.push(["status", "eq", status.value]);

  const outcome = await ctx.data.select(NODES_TABLE, {
    columns: NODES_COLUMNS,
    filters,
    order: { column: "app_name", ascending: true },
    limit: boundedLimit(args.limit),
  });
  if (outcome.error) return failure(`ecosystem_nodes query failed: ${outcome.error.message}`);

  const nodes = outcome.data ?? [];
  return text({ nodes, count: nodes.length });
}

async function dispatchTask(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolCallResult> {
  // `hitl_audit_logs.admin_id` is NOT NULL and references auth.users, so a row
  // cannot be attributed without a resolved user. An internal (HMAC or service
  // key) caller has no user id; inventing one — or reusing the bridge's literal
  // `requested_by: 'mcp_bridge_client'` — would attribute an approval to nobody.
  if (ctx.actor.kind !== "user" || !ctx.actor.userId) {
    return failure(
      "axim_dispatch_task requires a verified user caller: hitl_audit_logs.admin_id references auth.users, so an internal or key-only caller cannot be attributed",
    );
  }

  const action = optionalString(args.action, "action");
  if (!action.ok) return failure(action.error);
  if (!action.value) return failure("action is required");

  const department = optionalString(args.target_department, "target_department");
  if (!department.ok) return failure(department.error);
  const toolCalled = optionalString(args.tool_called, "tool_called");
  if (!toolCalled.ok) return failure(toolCalled.error);

  const row: Record<string, unknown> = {
    admin_id: ctx.actor.userId,
    action: action.value,
    status: HITL_PENDING_STATUS,
  };
  if (department.value) row.target_department = department.value;
  if (toolCalled.value) row.tool_called = toolCalled.value;

  const outcome = await ctx.data.insert(HITL_TABLE, row);
  if (outcome.error) return failure(`staging the task failed: ${outcome.error.message}`);

  return text({
    status: "STAGED_FOR_APPROVAL",
    message: "Queued in the Core HITL approval queue. Nothing executes before operator sign-off.",
  });
}

const IMPLEMENTATIONS: Record<
  string,
  (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolCallResult>
> = {
  core_health_check: (_args, ctx) => coreHealthCheck(ctx),
  telemetry_lookup: telemetryLookup,
  hitl_queue_status: hitlQueueStatus,
  axim_list_nodes: listNodes,
  axim_dispatch_task: dispatchTask,
};

export class UnknownToolError extends Error {
  constructor(name: string) {
    super(`unknown tool: ${name}`);
    this.name = "UnknownToolError";
  }
}

/**
 * Execute one tool.
 *
 * Throws `UnknownToolError` for a name that is not registered — the entrypoint
 * maps that to JSON-RPC `-32602`, because asking for a tool that does not exist
 * is a malformed request, whereas a tool that runs and fails returns
 * `isError: true` inside a successful response.
 */
export async function callTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolCallResult> {
  const implementation = IMPLEMENTATIONS[name];
  if (!implementation) throw new UnknownToolError(name);
  return implementation(args, ctx);
}
