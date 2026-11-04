/**
 * Robotics operation contracts for the robotics Edge Functions and the
 * simulation-queue consumer.
 *
 * Two gaps made this module necessary:
 *
 *   1. `cloudflare-workers/src/index.js` has routed
 *      `/api/v1/robotics/projects`, `/api/v1/robotics/sim` and
 *      `/api/v1/robotics/fleet/emergency-stop` at
 *      `functions/v1/robotics-projects`, `robotics-sim` and
 *      `robotics-emergency-stop` since the robotics schema landed. None of those
 *      functions existed, so every one of those routes answered Supabase's 404.
 *
 *   2. `robot_sim_run` action nodes in the DAG runner insert rows into
 *      `robot_simulation_runs` with `status = 'queued'`, and nothing ever
 *      consumed them. A queued run stayed queued for ever and the queue depth
 *      only grew.
 *
 * Everything here is dependency-free and receives its collaborators through
 * `RoboticsDeps`. That is what lets it be unit tested under Vitest/Node while
 * running unchanged on Supabase Edge, exactly like `workflowActions.ts`.
 *
 * Failure policy, consistent with `workflowActions.ts`: operations throw on
 * failure and the Edge entrypoint converts that into a response. Nothing in
 * here reports success it did not observe — in particular `drainSimulationQueue`
 * refuses to claim rows when no simulator is configured, rather than marking
 * work 'completed' that no simulation ever ran.
 */

// ---------------------------------------------------------------------------
// Postgres enums, mirrored from the migrations
// ---------------------------------------------------------------------------

/** `robot_class_enum` in 20280112000000_robotics_platform_schema.sql */
export const ROBOT_CLASSES = ["hexapod", "quadruped", "rover", "arm"] as const;
export type RobotClass = (typeof ROBOT_CLASSES)[number];

/** The CHECK constraint on `robot_simulation_runs.status`. */
export const SIM_RUN_STATUSES = [
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
] as const;
export type SimRunStatus = (typeof SIM_RUN_STATUSES)[number];

export const DEFAULT_SIM_SCENE = "default";
/** A day is longer than any headless scene we run; beyond that it is a typo. */
export const MAX_SIM_DURATION_SEC = 86_400;
export const DEFAULT_DRAIN_BATCH = 5;
/** Bounded so one invocation cannot hold a worker for minutes. */
export const MAX_DRAIN_BATCH = 25;
export const MAX_EMERGENCY_STOP_NODES = 500;

/** `robot_fault_logs.severity` is free text; the stop action always uses this. */
export const EMERGENCY_STOP_SEVERITY = "critical";
export const EMERGENCY_STOP_FAULT_TYPE = "emergency_stop";

// ---------------------------------------------------------------------------
// Minimal structural view of the PostgREST client
// ---------------------------------------------------------------------------

export interface QueryResult<T = unknown> {
  data: T | null;
  error: { message: string; code?: string } | null;
}

export interface PostgrestChain {
  eq(column: string, value: unknown): PostgrestChain;
  in(column: string, values: unknown[]): PostgrestChain;
  order(column: string, options?: { ascending?: boolean }): PostgrestChain;
  limit(count: number): PostgrestChain;
  single(): PromiseLike<QueryResult<Record<string, unknown>>>;
  maybeSingle(): PromiseLike<QueryResult<Record<string, unknown>>>;
  then<TResult1 = QueryResult<Record<string, unknown>[]>, TResult2 = never>(
    onfulfilled?:
      | ((value: QueryResult<Record<string, unknown>[]>) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2>;
}

export interface SupabaseLike {
  from(table: string): {
    select(columns?: string): PostgrestChain;
    insert(values: Record<string, unknown> | Record<string, unknown>[]): {
      select(columns?: string): {
        single(): PromiseLike<QueryResult<Record<string, unknown>>>;
      } & PromiseLike<QueryResult<Record<string, unknown>[]>>;
    };
    update(values: Record<string, unknown>): {
      eq(column: string, value: unknown): PostgrestChain;
      in(column: string, values: unknown[]): PostgrestChain;
    };
  };
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<QueryResult<unknown>>;
}

export interface RoboticsDeps {
  supabase: SupabaseLike;
  /** Injected so tests never perform real IO. */
  fetchImpl: typeof fetch;
  /** SSRF guard shared with the scrapers; throws for loopback/private/link-local. */
  assertPublicUrl: (url: string) => Promise<void>;
  /** Unix millis; injected for deterministic tests. */
  now: () => number;
  /** External headless simulator. Absent means the queue cannot be drained. */
  simEndpoint?: string;
  /** Hard timeout for one dispatch to the simulator. */
  simTimeoutMs?: number;
}

export const DEFAULT_SIM_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type Validation<T> = { ok: true; value: T } | { ok: false; error: string };

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): boolean {
  return typeof value === "string" && UUID_PATTERN.test(value.trim());
}

/** Trimmed non-empty string, or null when the input is absent/blank. */
export function optionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export interface CreateProjectInput {
  name: string;
  robot_class: RobotClass;
  target_specs: Record<string, unknown>;
}

export function validateCreateProject(body: unknown): Validation<CreateProjectInput> {
  const input = asRecord(body);

  const name = optionalString(input.name);
  if (!name) return { ok: false, error: "name is required" };
  if (name.length > 120) return { ok: false, error: "name must be 120 characters or fewer" };

  const robotClass = optionalString(input.robot_class);
  if (!robotClass) return { ok: false, error: "robot_class is required" };
  if (!(ROBOT_CLASSES as readonly string[]).includes(robotClass)) {
    return {
      ok: false,
      error: `robot_class must be one of: ${ROBOT_CLASSES.join(", ")}`,
    };
  }

  const targetSpecs = input.target_specs;
  if (targetSpecs !== undefined && (typeof targetSpecs !== "object" || targetSpecs === null || Array.isArray(targetSpecs))) {
    return { ok: false, error: "target_specs must be an object" };
  }

  return {
    ok: true,
    value: {
      name,
      robot_class: robotClass as RobotClass,
      target_specs: asRecord(targetSpecs),
    },
  };
}

export interface SimRequestInput {
  project_id: string;
  scene_type: string;
  duration_sec: number;
  params: Record<string, unknown>;
}

export function validateSimRequest(body: unknown): Validation<SimRequestInput> {
  const input = asRecord(body);

  const projectId = optionalString(input.project_id);
  if (!projectId) return { ok: false, error: "project_id is required" };
  if (!isUuid(projectId)) return { ok: false, error: "project_id must be a UUID" };

  const sceneType = optionalString(input.scene_type) ?? DEFAULT_SIM_SCENE;
  if (sceneType.length > 64) return { ok: false, error: "scene_type must be 64 characters or fewer" };

  // Note the order: `Number(undefined)` is NaN and `Number(null)` is 0, so the
  // raw value is type-checked before it is coerced. A missing duration must be
  // a 400, not a defaulted 0 that trips the table's CHECK constraint later.
  const rawDuration = input.duration_sec;
  if (typeof rawDuration !== "number" && typeof rawDuration !== "string") {
    return { ok: false, error: "duration_sec is required and must be a number" };
  }
  const duration = Number(rawDuration);
  if (!Number.isFinite(duration) || duration <= 0) {
    return { ok: false, error: "duration_sec must be a positive number" };
  }
  if (duration > MAX_SIM_DURATION_SEC) {
    return { ok: false, error: `duration_sec must not exceed ${MAX_SIM_DURATION_SEC}` };
  }

  const params = input.params;
  if (params !== undefined && (typeof params !== "object" || params === null || Array.isArray(params))) {
    return { ok: false, error: "params must be an object" };
  }

  return {
    ok: true,
    value: {
      project_id: projectId,
      scene_type: sceneType,
      duration_sec: Math.round(duration),
      params: asRecord(params),
    },
  };
}

export interface EmergencyStopInput {
  project_id: string | null;
  node_ids: string[];
  reason: string | null;
}

/**
 * A stop request must name its scope. Stopping "everything" by omission is the
 * kind of default a safety action must not have: an empty body would halt the
 * whole fleet.
 */
export function validateEmergencyStop(body: unknown): Validation<EmergencyStopInput> {
  const input = asRecord(body);

  const projectId = optionalString(input.project_id);
  if (projectId !== null && !isUuid(projectId)) {
    return { ok: false, error: "project_id must be a UUID" };
  }

  let nodeIds: string[] = [];
  if (input.node_ids !== undefined) {
    if (!Array.isArray(input.node_ids)) {
      return { ok: false, error: "node_ids must be an array of strings" };
    }
    nodeIds = input.node_ids
      .map((value) => optionalString(value))
      .filter((value): value is string => value !== null);
    if (nodeIds.length !== input.node_ids.length) {
      return { ok: false, error: "node_ids must contain only non-empty strings" };
    }
    if (nodeIds.length > MAX_EMERGENCY_STOP_NODES) {
      return {
        ok: false,
        error: `node_ids must contain at most ${MAX_EMERGENCY_STOP_NODES} entries`,
      };
    }
  }

  if (!projectId && nodeIds.length === 0) {
    return { ok: false, error: "either project_id or node_ids is required" };
  }

  const reason = optionalString(input.reason);
  if (reason && reason.length > 500) {
    return { ok: false, error: "reason must be 500 characters or fewer" };
  }

  return { ok: true, value: { project_id: projectId, node_ids: nodeIds, reason } };
}

export function validateDrainRequest(body: unknown): Validation<{ limit: number }> {
  const input = asRecord(body);
  if (input.limit === undefined || input.limit === null || input.limit === "") {
    return { ok: true, value: { limit: DEFAULT_DRAIN_BATCH } };
  }
  const limit = Number(input.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_DRAIN_BATCH) {
    return {
      ok: false,
      error: `limit must be an integer between 1 and ${MAX_DRAIN_BATCH}`,
    };
  }
  return { ok: true, value: { limit } };
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

export async function createProject(
  input: CreateProjectInput,
  deps: RoboticsDeps,
): Promise<Record<string, unknown>> {
  const { data, error } = await deps.supabase
    .from("robot_projects")
    .insert({
      name: input.name,
      robot_class: input.robot_class,
      target_specs: input.target_specs,
      status: "active",
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create project: ${error.message}`);
  if (!data) throw new Error("Failed to create project: no row returned");
  return data;
}

export async function listProjects(
  deps: RoboticsDeps,
  options: { projectId?: string | null; limit?: number } = {},
): Promise<Record<string, unknown>[]> {
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 200);
  let chain = deps.supabase
    .from("robot_projects")
    .select("id, name, robot_class, target_specs, status, created_at, updated_at");

  if (options.projectId) {
    chain = chain.eq("id", options.projectId);
  }

  const { data, error } = await chain.order("created_at", { ascending: false }).limit(limit);
  if (error) throw new Error(`Failed to list projects: ${error.message}`);
  return Array.isArray(data) ? data : [];
}

export async function projectExists(projectId: string, deps: RoboticsDeps): Promise<boolean> {
  const { data, error } = await deps.supabase
    .from("robot_projects")
    .select("id")
    .eq("id", projectId)
    .maybeSingle();

  if (error) throw new Error(`Project lookup failed: ${error.message}`);
  return Boolean(data);
}

export interface QueuedSimRun {
  id: string;
  project_id: string;
  scene_type: string;
  duration_sec: number;
  workflow_run_id: string | null;
  params: Record<string, unknown>;
}

/**
 * Queue a simulation run. Mirrors what `runRobotSim` in `workflowActions.ts`
 * writes, so a run queued from the API and a run queued from a workflow are
 * indistinguishable to the consumer.
 */
export async function queueSimulationRun(
  input: SimRequestInput,
  deps: RoboticsDeps,
  context: { workflowRunId?: string | null } = {},
): Promise<Record<string, unknown>> {
  const { data, error } = await deps.supabase
    .from("robot_simulation_runs")
    .insert({
      project_id: input.project_id,
      scene_type: input.scene_type,
      duration_sec: input.duration_sec,
      status: "queued",
      params: input.params,
      workflow_run_id: context.workflowRunId ?? null,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to queue simulation run: ${error.message}`);
  if (!data) throw new Error("Failed to queue simulation run: no row returned");
  return data;
}

export async function listSimulationRuns(
  deps: RoboticsDeps,
  options: { projectId?: string | null; runId?: string | null; limit?: number } = {},
): Promise<Record<string, unknown>[]> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  let chain = deps.supabase
    .from("robot_simulation_runs")
    .select(
      "id, project_id, scene_type, duration_sec, status, params, workflow_run_id, exit_state, created_at, completed_at, claimed_at",
    );

  if (options.projectId) chain = chain.eq("project_id", options.projectId);
  if (options.runId) chain = chain.eq("id", options.runId);

  const { data, error } = await chain.order("created_at", { ascending: false }).limit(limit);
  if (error) throw new Error(`Failed to list simulation runs: ${error.message}`);
  return Array.isArray(data) ? data : [];
}

export interface EmergencyStopOutcome {
  stopped: number;
  scope: "project" | "nodes";
  fault_log_ids: string[];
}

/**
 * Halt fleet nodes and write an audit row for each one.
 *
 * Order matters: the fleet rows are moved to `emergency_stop` first, because
 * that is the action that actually stops motion, and only then are the fault
 * logs written. If the audit insert fails the caller sees an error, but the
 * robots are already stopped — the safe direction for a partial failure.
 */
export async function emergencyStopFleet(
  input: EmergencyStopInput,
  deps: RoboticsDeps,
  actor: { kind: string; userId: string | null },
): Promise<EmergencyStopOutcome> {
  const scope: "project" | "nodes" = input.project_id ? "project" : "nodes";

  const update = deps.supabase
    .from("robot_fleet_nodes")
    .update({ status: "emergency_stop" });

  const targeted = input.project_id
    ? update.eq("project_id", input.project_id)
    : update.in("id", input.node_ids);

  const { data: updatedRows, error: updateError } = await targeted.select("id");
  if (updateError) throw new Error(`Failed to stop fleet nodes: ${updateError.message}`);

  const stoppedIds = Array.isArray(updatedRows)
    ? updatedRows
        .map((row) => (typeof row?.id === "string" ? row.id : null))
        .filter((id): id is string => id !== null)
    : [];

  if (stoppedIds.length === 0) {
    return { stopped: 0, scope, fault_log_ids: [] };
  }

  const faultRows = stoppedIds.map((nodeId) => ({
    node_id: nodeId,
    fault_type: EMERGENCY_STOP_FAULT_TYPE,
    severity: EMERGENCY_STOP_SEVERITY,
    diagnostic_trace: {
      reason: input.reason,
      scope,
      project_id: input.project_id,
      requested_by: actor.userId,
      requested_by_kind: actor.kind,
      requested_at: new Date(deps.now()).toISOString(),
    },
  }));

  const { data: faultLogs, error: faultError } = await deps.supabase
    .from("robot_fault_logs")
    .insert(faultRows)
    .select("id");

  if (faultError) {
    throw new Error(
      `Fleet nodes stopped (${stoppedIds.length}) but the audit log failed: ${faultError.message}`,
    );
  }

  const faultLogIds = Array.isArray(faultLogs)
    ? faultLogs
        .map((row) => (typeof row?.id === "string" ? row.id : null))
        .filter((id): id is string => id !== null)
    : [];

  return { stopped: stoppedIds.length, scope, fault_log_ids: faultLogIds };
}

// ---------------------------------------------------------------------------
// Simulation queue consumer
// ---------------------------------------------------------------------------

export interface DrainOutcomeRow {
  id: string;
  status: "completed" | "failed";
  exit_state: string;
}

export interface DrainOutcome {
  claimed: number;
  completed: number;
  failed: number;
  runs: DrainOutcomeRow[];
}

export class SimulatorNotConfiguredError extends Error {
  constructor() {
    super(
      "no headless simulator is configured (ROBOTICS_SIM_ENDPOINT is unset); queued runs were left queued",
    );
    this.name = "SimulatorNotConfiguredError";
  }
}

/**
 * Claim queued runs and dispatch each one to the configured simulator.
 *
 * Claiming is a single `FOR UPDATE SKIP LOCKED` RPC (`claim_robot_simulation_runs`),
 * so two concurrent invocations of this function can never take the same row —
 * a plain `select` followed by an `update` would hand the same run to both.
 *
 * When no simulator is configured this throws *before* claiming anything. The
 * alternative — claiming and then marking the run 'failed' — would turn an
 * operator configuration gap into permanent data loss, and would report a
 * failure for work that never started.
 */
export async function drainSimulationQueue(
  limit: number,
  deps: RoboticsDeps,
): Promise<DrainOutcome> {
  if (!deps.simEndpoint) throw new SimulatorNotConfiguredError();
  await deps.assertPublicUrl(deps.simEndpoint);

  const { data: claimed, error: claimError } = await deps.supabase.rpc(
    "claim_robot_simulation_runs",
    { p_limit: limit },
  );
  if (claimError) throw new Error(`Failed to claim queued runs: ${claimError.message}`);

  const runs: QueuedSimRun[] = (Array.isArray(claimed) ? claimed : []).map((row) => {
    const record = asRecord(row);
    return {
      id: String(record.id),
      project_id: String(record.project_id ?? ""),
      scene_type: String(record.scene_type ?? DEFAULT_SIM_SCENE),
      duration_sec: Number(record.duration_sec ?? 0),
      workflow_run_id:
        typeof record.workflow_run_id === "string" ? record.workflow_run_id : null,
      params: asRecord(record.params),
    };
  });

  const outcome: DrainOutcome = { claimed: runs.length, completed: 0, failed: 0, runs: [] };

  for (const run of runs) {
    const result = await dispatchToSimulator(run, deps);
    await completeSimulationRun(run.id, result, deps);
    if (result.status === "completed") outcome.completed += 1;
    else outcome.failed += 1;
    outcome.runs.push({ id: run.id, status: result.status, exit_state: result.exit_state });
  }

  return outcome;
}

async function dispatchToSimulator(
  run: QueuedSimRun,
  deps: RoboticsDeps,
): Promise<{ status: "completed" | "failed"; exit_state: string }> {
  const timeoutMs = deps.simTimeoutMs ?? DEFAULT_SIM_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await deps.fetchImpl(deps.simEndpoint as string, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        run_id: run.id,
        project_id: run.project_id,
        scene_type: run.scene_type,
        duration_sec: run.duration_sec,
        params: run.params,
        workflow_run_id: run.workflow_run_id,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return { status: "failed", exit_state: `simulator_http_${response.status}` };
    }

    // A simulator that answers 2xx with an unreadable body has not told us the
    // scene finished, so the run is not 'completed'.
    let payload: Record<string, unknown>;
    try {
      payload = asRecord(await response.json());
    } catch {
      return { status: "failed", exit_state: "simulator_unreadable_response" };
    }

    const exitState = optionalString(payload.exit_state) ?? "completed";
    return { status: "completed", exit_state: exitState };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: "failed",
      exit_state: message.toLowerCase().includes("abort")
        ? "simulator_timeout"
        : `simulator_error: ${message}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function completeSimulationRun(
  runId: string,
  result: { status: "completed" | "failed"; exit_state: string },
  deps: RoboticsDeps,
): Promise<void> {
  const { error } = await deps.supabase
    .from("robot_simulation_runs")
    .update({
      status: result.status,
      exit_state: result.exit_state,
      completed_at: new Date(deps.now()).toISOString(),
    })
    .eq("id", runId);

  if (error) {
    throw new Error(`Failed to record the outcome of run ${runId}: ${error.message}`);
  }
}

/**
 * Queue depth, so an operator can see a backlog before it becomes a mystery.
 * Distinct from `drainSimulationQueue`: this reads and never claims.
 */
export async function simulationQueueStats(deps: RoboticsDeps): Promise<{
  queued: number;
  running: number;
  oldest_queued_at: string | null;
}> {
  const { data, error } = await deps.supabase
    .from("robot_simulation_runs")
    .select("id, status, created_at")
    .in("status", ["queued", "running"])
    .order("created_at", { ascending: true })
    .limit(500);

  if (error) throw new Error(`Failed to read queue depth: ${error.message}`);

  const rows = Array.isArray(data) ? data : [];
  const queued = rows.filter((row) => row?.status === "queued");
  const running = rows.filter((row) => row?.status === "running");
  const oldestQueuedAt =
    queued.length > 0 && typeof queued[0]?.created_at === "string"
      ? queued[0].created_at
      : null;

  return {
    queued: queued.length,
    running: running.length,
    oldest_queued_at: oldestQueuedAt,
  };
}
