/**
 * Typed action-node execution for the trigger-workflow DAG runner.
 *
 * Prior behaviour: every `action` node hit
 *
 *     result = { message: `Action ${label} executed` };
 *
 * i.e. a silent no-op that reported success. This module replaces that with
 * real dispatch for the node types the builder emits, and an explicit
 * "unsupported" failure instead of a fabricated success for anything else.
 *
 * No `Deno.*` access and no module-level side effects: every capability is
 * injected through ActionDeps, which is what makes the handlers testable under
 * Vitest while running unchanged on Supabase Edge.
 *
 * Failure policy: a handler throws on failure. The DAG runner catches, records
 * `success: false` for that node, stops the run and marks the execution
 * 'failed' - a non-zero number of network hops should never be reported as a
 * completed workflow.
 */

export type ActionType =
  | "api_call"
  | "email"
  | "robot_sim_run"
  | "robot_policy_gate"
  | "robot_ota_deploy";

export const SUPPORTED_ACTION_TYPES: readonly ActionType[] = [
  "api_call",
  "email",
  "robot_sim_run",
  "robot_policy_gate",
  "robot_ota_deploy",
];

export const DEFAULT_HTTP_TIMEOUT_MS = 10_000;

/** Minimal structural views so this module does not depend on supabase-js. */
export interface QueryResult<T = unknown> {
  data: T | null;
  error: { message: string } | null;
}

export interface SupabaseLike {
  from(table: string): {
    insert(values: Record<string, unknown>): {
      select(columns?: string): {
        single(): Promise<QueryResult<Record<string, unknown>>>;
      } & PromiseLike<QueryResult<Record<string, unknown>[]>>;
    };
    select(columns?: string): {
      eq(column: string, value: unknown): {
        order(column: string, options?: { ascending?: boolean }): {
          limit(count: number): PromiseLike<QueryResult<Record<string, unknown>[]>>;
        } & PromiseLike<QueryResult<Record<string, unknown>[]>>;
      } & PromiseLike<QueryResult<Record<string, unknown>[]>>;
    };
    update(values: Record<string, unknown>): {
      eq(column: string, value: unknown): PromiseLike<QueryResult<null>>;
      in(column: string, values: unknown[]): PromiseLike<QueryResult<null>>;
    };
  };
}

export interface EmailMessage {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: string;
}

export interface ActionDeps {
  supabase: SupabaseLike;
  supabaseUrl: string;
  /** SSRF guard: throws for loopback/private/link-local/metrics hosts. */
  assertPublicUrl: (url: string) => Promise<void>;
  /** Injected so tests do not perform real IO. */
  fetchImpl: typeof fetch;
  /** Injected so trigger-workflow can reuse EmailDispatchManager. */
  sendEmail: (message: EmailMessage) => Promise<{ success: boolean; messageId?: string }>;
  /** Unix millis; injected for deterministic tests. */
  now: () => number;
}

export interface NodeResult {
  step: string;
  nodeId: string;
  actionType: string | null;
  success: boolean;
  message: string;
  output?: unknown;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Resolve the action type for a node. The builder writes `data.actionType`;
 * hand-authored and legacy definitions may use `data.config.type` or the bare
 * `data.label`. Anything unrecognised yields null so the runner can fail loudly.
 */
export function resolveActionType(node: unknown): ActionType | string | null {
  const data = asRecord(asRecord(node).data);
  const config = asRecord(data.config);

  const candidates = [data.actionType, data.action, config.type, config.action_type, data.type];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim() !== "") {
      return candidate.trim() as ActionType;
    }
  }
  return null;
}

export function nodeLabel(node: unknown): string {
  const data = asRecord(asRecord(node).data);
  const label = data.label ?? asRecord(node).id ?? "unnamed node";
  return String(label);
}

function requireString(value: unknown, field: string, nodeLabelText: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Node "${nodeLabelText}" is missing required config.${field}`);
  }
  return value.trim();
}

/**
 * api_call: outbound HTTP webhook / REST dispatch.
 * Guarded by assertPublicUrl so a workflow definition cannot be used to pivot
 * into the cluster's internal network.
 */
async function runApiCall(
  node: Record<string, unknown>,
  context: Record<string, unknown>,
  deps: ActionDeps,
): Promise<{ message: string; data: unknown }> {
  const label = nodeLabel(node);
  const config = asRecord(asRecord(node.data).config);

  const url = requireString(config.url ?? config.endpoint, "url", label);
  await deps.assertPublicUrl(url);

  const method = String(config.method ?? "POST").toUpperCase();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(asRecord(config.headers) as Record<string, string>),
  };

  const bodySource = config.body ?? config.payload;
  const body = bodySource === undefined ? undefined : JSON.stringify(bodySource);

  const timeoutMs = Number.isFinite(Number(config.timeout_ms))
    ? Number(config.timeout_ms)
    : DEFAULT_HTTP_TIMEOUT_MS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = deps.now();

  try {
    const response = await deps.fetchImpl(url, {
      method,
      headers,
      body: method === "GET" || method === "HEAD" ? undefined : body,
      signal: controller.signal,
    });

    const responseText = await response.text();
    const durationMs = deps.now() - startedAt;

    if (!response.ok) {
      throw new Error(
        `api_call ${method} ${url} failed with HTTP ${response.status} after ${durationMs}ms`,
      );
    }

    return {
      message: `${method} ${url} -> ${response.status} (${durationMs}ms)`,
      data: {
        status: response.status,
        duration_ms: durationMs,
        body: responseText.slice(0, 2000),
        workflowRunId: context.workflowRunId ?? null,
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

/** email: transactional send through the injected dispatcher. */
async function runEmail(
  node: Record<string, unknown>,
  context: Record<string, unknown>,
  deps: ActionDeps,
): Promise<{ message: string; data: unknown }> {
  const label = nodeLabel(node);
  const config = asRecord(asRecord(node.data).config);
  const data = asRecord(node.data);

  const to = config.to ?? data.to;
  if (typeof to !== "string" && !Array.isArray(to)) {
    throw new Error(`Node "${label}" is missing required config.to`);
  }

  const subject = String(config.subject ?? data.subject ?? `${label} (${context.workflowRunId ?? "run"})`);
  const html = typeof config.body === "string" ? config.body : undefined;
  const text = typeof config.text === "string" ? config.text : undefined;

  const result = await deps.sendEmail({
    to: to as string | string[],
    subject,
    html,
    text,
    from: typeof config.from === "string" ? config.from : undefined,
  });

  if (!result?.success) {
    throw new Error(`Email dispatch failed for node "${label}"`);
  }

  return {
    message: `Email sent to ${Array.isArray(to) ? to.join(", ") : to}`,
    data: { messageId: result.messageId ?? null, subject },
  };
}

/** robot_sim_run: queue a headless simulation run for a robotics project. */
async function runRobotSim(
  node: Record<string, unknown>,
  context: Record<string, unknown>,
  deps: ActionDeps,
): Promise<{ message: string; data: unknown }> {
  const label = nodeLabel(node);
  const config = asRecord(asRecord(node.data).config);

  const projectId = requireString(config.project_id, "project_id", label);
  const sceneType = typeof config.scene_type === "string" ? config.scene_type : "default";
  const durationSec = Number(config.duration_sec);
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    throw new Error(`Node "${label}" requires a positive numeric config.duration_sec`);
  }

  const { data, error } = await deps.supabase
    .from("robot_simulation_runs")
    .insert({
      project_id: projectId,
      scene_type: sceneType,
      duration_sec: Math.round(durationSec),
      status: "queued",
      params: asRecord(config.params),
      workflow_run_id: context.workflowRunId ?? null,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to queue simulation run: ${error.message}`);
  }

  return {
    message: `Simulation queued (${sceneType}/${durationSec}s)`,
    data: { sim_id: (data as Record<string, unknown>)?.id ?? null, exit_state: "queued" },
  };
}

/**
 * robot_policy_gate: evaluate the newest policy for a project against the
 * threshold in the node config. Fails the node when no policy is registered,
 * rather than defaulting to a pass.
 */
async function runRobotPolicyGate(
  node: Record<string, unknown>,
  _context: Record<string, unknown>,
  deps: ActionDeps,
): Promise<{ message: string; data: unknown }> {
  const label = nodeLabel(node);
  const config = asRecord(asRecord(node.data).config);
  const projectId = requireString(config.project_id, "project_id", label);
  const threshold = Number.isFinite(Number(config.min_benchmark_score))
    ? Number(config.min_benchmark_score)
    : 0.8;

  const { data, error } = await deps.supabase
    .from("robot_policy_registry")
    .select("id, version, benchmark_score, status")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(`Policy lookup failed: ${error.message}`);
  }

  const policy = Array.isArray(data) ? data[0] : null;
  if (!policy) {
    throw new Error(`No policy registered for project ${projectId}`);
  }

  const score = Number((policy as Record<string, unknown>).benchmark_score);
  const passed = Number.isFinite(score) && score >= threshold;

  if (!passed) {
    throw new Error(
      `Policy ${String((policy as Record<string, unknown>).version)} scored ${Number.isFinite(score) ? score : "n/a"} < threshold ${threshold}`,
    );
  }

  return {
    message: `Policy ${String((policy as Record<string, unknown>).version)} passed (${score} >= ${threshold})`,
    data: { passed, score, policy_id: (policy as Record<string, unknown>).id },
  };
}

/**
 * robot_ota_deploy: register the deployment in the policy registry and move the
 * targeted fleet nodes onto the new firmware version. Both writes are real; the
 * node reports how many fleet nodes it actually touched.
 */
async function runRobotOtaDeploy(
  node: Record<string, unknown>,
  context: Record<string, unknown>,
  deps: ActionDeps,
): Promise<{ message: string; data: unknown }> {
  const label = nodeLabel(node);
  const config = asRecord(asRecord(node.data).config);

  const projectId = requireString(config.project_id, "project_id", label);
  const version = requireString(config.version, "version", label);
  const targetNodes = Array.isArray(config.node_ids) ? config.node_ids.map(String) : [];

  const { data: registryRow, error: registryError } = await deps.supabase
    .from("robot_policy_registry")
    .insert({
      project_id: projectId,
      version,
      weights_hash: String(config.weights_hash ?? `workflow-run:${context.workflowRunId ?? "unknown"}`),
      status: "approved",
    })
    .select()
    .single();

  if (registryError) {
    throw new Error(`Failed to register OTA package: ${registryError.message}`);
  }

  let dispatchedCount = 0;
  if (targetNodes.length > 0) {
    const { error: fleetError } = await deps.supabase
      .from("robot_fleet_nodes")
      .update({ firmware_version: version })
      .in("id", targetNodes);

    if (fleetError) {
      throw new Error(`Failed to dispatch OTA to fleet nodes: ${fleetError.message}`);
    }
    dispatchedCount = targetNodes.length;
  }

  return {
    message: `OTA ${version} deployed to ${dispatchedCount} fleet node(s)`,
    data: {
      status: "deployed",
      policy_id: (registryRow as Record<string, unknown>)?.id ?? null,
      version,
      dispatched_nodes: dispatchedCount,
    },
  };
}

/**
 * Execute one action node. Throws on failure; the caller converts that into a
 * failed NodeResult and halts the DAG.
 */
export async function executeActionNode(
  node: unknown,
  context: Record<string, unknown>,
  deps: ActionDeps,
): Promise<{ message: string; data: unknown }> {
  const label = nodeLabel(node);
  const actionType = resolveActionType(node);

  if (!actionType) {
    throw new Error(
      `Node "${label}" has no recognisable action type (expected data.actionType, e.g. api_call)`,
    );
  }

  const nodeRecord = asRecord(node);

  switch (actionType) {
    case "api_call":
      return await runApiCall(nodeRecord, context, deps);
    case "email":
      return await runEmail(nodeRecord, context, deps);
    case "robot_sim_run":
      return await runRobotSim(nodeRecord, context, deps);
    case "robot_policy_gate":
      return await runRobotPolicyGate(nodeRecord, context, deps);
    case "robot_ota_deploy":
      return await runRobotOtaDeploy(nodeRecord, context, deps);
    default:
      throw new Error(`Unsupported action type "${actionType}" on node "${label}"`);
  }
}

/**
 * Roll node results up into a persisted execution status.
 *
 * `aborted` is set by the runner when a node threw and the remainder of the DAG
 * was skipped. A run that did not execute its full graph is 'failed', never
 * 'completed' - the previous implementation hard-coded 'completed' even when
 * every action node had failed.
 */
export function deriveExecutionStatus(
  results: NodeResult[],
  aborted = false,
): "completed" | "failed" {
  if (aborted) return "failed";
  if (results.some((result) => !result.success)) return "failed";
  return "completed";
}
