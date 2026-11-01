# Verification for AXiM Core Wave 126 — Action-Node Configuration & Real Execution History

Execution window: 2026-11-01, 11:00–13:30 America/Chicago (UTC-06:00)
Branch base: `9a68ad5` (feat(core): workflow persistence, real DAG action dispatch, edge ingress hardening)
Branch: `feat/core-wave-126-node-inspector-and-execution-history`

This appendix follows the Proof-of-Fix protocol in `AGENTS.md` §0: for every
item, the target file and line range, the exact change, and the test that fails
without it and passes with it. Every claim below was produced by inspecting the
repository and running the command shown, not by reading prior notes.

---

## 0. Baseline findings (Phase 1)

Commands run against the clean tree at `9a68ad5`, before any edit:

| Check | Result |
| --- | --- |
| `git status` | clean, on `feat/core-wave-125-workflow-persistence-and-ingress` |
| `npx eslint .` | exit 0, no output (0 errors, 0 warnings) |
| `npm test` (`vitest run --coverage`) | **green** — 110 files passed / 2 skipped, 584 tests passed / 9 skipped, 0 failures |
| `npx esbuild src/index.js --bundle` (cloudflare-workers) | OK, 11.6 KB |
| `npx wrangler deploy --dry-run -c wrangler.toml` | OK, 32.79 KiB / gzip 8.09 KiB |
| `npx wrangler deploy --dry-run` (mcp-bridge) | OK, 40.63 KiB / gzip 9.74 KiB |
| `deno check supabase/functions/*` | not runnable — Deno is not installed in this environment |
| `GET https://axim-core.jrellars.workers.dev/health` | 200 `{"ok":true}` — **not** the body this worker emits (see 0.1) |

Baseline was green, so cardinal rule 2 raised no freeze: the wall clock went
straight to scheduled engineering.

### 0.1 Perimeter probes disagree with the worker source (environment, not code)

The runbook's Phase 1 step 1.6 asks for a health check against the three ingress
hosts. They do not answer as the worker in this repo is written:

| Probe | Observed | What the worker source says |
| --- | --- | --- |
| `GET https://api.axim.us.com/health` | 302 → `/404.html`, `host-header: shared.bluehost.com` | Proxy to `/functions/v1/...`; health returns 202 `{"status":"UP"}` |
| `GET https://api.axim.us.com/api/v1/health` | 302 → `/404.html` (same Bluehost origin) | 200 `{"status":"UP", ...}` |
| `GET https://core.axim.us.com/health` | connection failure (name does not resolve) | 202 |
| `GET https://axim-core.jrellars.workers.dev/health` | 200 `{"ok":true}` | 202 `{"status":"UP"}` |
| `GET https://axim-core-worker.jrellars.workers.dev/health` | 200 `text/html` — the Vite dashboard SPA | 202 JSON |
| `GET https://axim-core-mcp.jrellars.workers.dev/` | 404 `{"jsonrpc":"2.0","error":{"code":-32601,...}}` | MCP bridge answers, as expected |

So: `api.axim.us.com` is served by a Bluehost shared host, `core.axim.us.com` has
no DNS record, and the workers.dev hosts in front of `axim-core-worker` are
serving the dashboard bundle rather than `cloudflare-workers/src/index.js`.
Nothing in the repository can change this — it is DNS and Cloudflare route
configuration in the account, not code. Recorded here so the next cycle does not
re-discover it, and raised in the runbook handoff as an operator action. The
edge worker itself is verified by `wrangler deploy --dry-run` and by
`tests/edge-worker.test.js` / `tests/edge-ingress-hardening.test.js`.

---

## 1. The builder could not author a runnable action node

* Target: `src/utils/workflowNodeConfig.js` (new),
  `src/components/admin/WorkflowNodeInspector.jsx` (new),
  `src/components/admin/WorkflowBuilder.jsx:118-146, 236-268, 300-360, 470-500`
* Failure: `_shared/workflowActions.ts` requires a per-type config —
  `api_call` needs `config.url`, `email` needs `config.to`, `robot_sim_run`
  needs `config.project_id` + a positive `config.duration_sec`,
  `robot_ota_deploy` needs `config.project_id` + `config.version`. The builder
  emitted `data: { label }` and nothing else. There was no way to author those
  fields in the UI at all, so every action node created in the builder was
  guaranteed to throw in the runner (which halts the DAG), and the only way to
  get a working workflow was to hand-edit JSON in the database.
  `Continued Development Plan.md` §5 records this as the open item.
* Change:
  - `src/utils/workflowNodeConfig.js` — the config contract for all five action
    types as data: field list, required flags, types, bounds, defaults and help
    text, plus `validateActionConfig()`, `validateWorkflowActions()`,
    `getDefaultActionConfig()`, `applyActionType()` and JSON/list coercion
    helpers. Every rule traces to a `requireString` / `Number.isFinite` check in
    `workflowActions.ts`, so a node that validates here cannot be rejected there
    for a reason the operator could not see. Pure functions, no React, no IO.
  - `src/components/admin/WorkflowNodeInspector.jsx` — the panel, driven by that
    schema rather than a hand-written form per type. Buffers JSON text locally
    and commits only on a successful parse (half-typed JSON never lands in the
    definition), commits list fields as a string when single and an array when
    several (`node_ids` always an array, because the OTA handler reads it with
    `Array.isArray(...) ? ... : []` and would silently drop a bare string), and
    shows the validation state the runner would produce.
  - `WorkflowBuilder.jsx` — `selectedNodeId` state, `onNodeClick`/`onPaneClick`
    binding, `updateNodeData` / `deleteNode` (which also drops the orphaned
    edges that make React Flow throw on rehydration), the inspector in a
    side panel, action-type badges on the canvas node, and the action type
    seeded on new action nodes so the panel opens on a real field set.
  - `WorkflowBuilder.jsx:236-268` — **pre-dispatch gate**. "Run Workflow" now
    validates the whole graph first and refuses to dispatch when any action node
    is incomplete, naming the offending step and selecting it. Save still
    persists drafts; dispatch is the operation that must not proceed. This is
    the same class of failure as the wave-125 fixed run: a run that halts
    mid-DAG after the first node.
* Proving tests:
  - `src/utils/workflowNodeConfig.test.js` (38 tests) — the catalogue matches
    `SUPPORTED_ACTION_TYPES` exactly, required-field flags match the runner's
    `requireString` calls, URL/UUID/number/select/JSON validation, per-node issue
    collection, and `applyActionType` carrying config across types only where the
    new type declares it.
  - `src/components/admin/WorkflowNodeInspector.test.jsx` (22 tests) — field set
    per type, action-type switching, JSON buffering (invalid text produces no
    `onChange`, valid text commits), recipient string-vs-array, `node_ids` always
    array, uuid and range errors surfaced, reset on node switch.
  - `src/components/admin/WorkflowBuilder.test.jsx` (9 tests, 6 new) — clicking a
    canvas node opens the inspector on it, config edits reach the persisted
    definition, and **an unconfigured step blocks dispatch**:
    `expect(supabaseApiService.supabase.functions.invoke).not.toHaveBeenCalled()`
    with `toast.error('"Format Payload": Endpoint URL is required.')`. Before this
    change the same click called `invoke('trigger-workflow', ...)` unconditionally.

## 2. The History tab read a table the runner never writes

* Target: `src/services/supabaseApiService.js:854-905` (replaced),
  `src/services/supabaseApiService.js:32-120` (normalisers),
  `src/components/admin/WorkflowExecutionLog.jsx` (rewritten render path)
* Failure: `getWorkflowExecutions()` selected from `events_ax2024` filtered on
  `type IN ('workflow_executed','workflow_triggered')`. The DAG runner writes
  `workflow_execution_logs` (migration `20281101010000`), so the tab was empty
  for every real run. The rows it could show had no `status` column and no
  `error_message` — the component had to infer an outcome from
  `data.results`, and a run aborted by a failing node rendered as an amber
  "legacy trigger" warning with no reason given. A failed robotics deploy and a
  successful one were visually identical.
* Change:
  - `getWorkflowExecutions()` selects
    `id, workflow_id, workflow_run_id, workflow_name, status, error_message,
    node_results, duration_ms, execution_context, created_at` from
    `workflow_execution_logs`, newest first, and maps each row through
    `normalizeExecutionLogRow()` (adds `steps_total` / `steps_succeeded` and a
    `source` tag).
  - `getLegacyWorkflowExecutions()` keeps the old event query as a fallback, but
    only for a genuinely absent relation: `isMissingRelationError()` accepts
    `42P01` and `PGRST205` and nothing else. A `42501` permission denial or a
    transport error rethrows — silently showing "no history" because an RLS
    policy is wrong would hide the actual defect.
  - `normalizeLegacyExecutionRow()` reports `status: 'unknown'` when a legacy row
    carries no step results, instead of the old implicit "looks fine" rendering.
  - `WorkflowExecutionLog.jsx` renders `status`, `workflow_run_id`, duration,
    step counts, and the `error_message` that aborted the run (in red detail
    text), with the filter relabelled All / Success / Failed / Unknown.
    `formatDuration` rounds to the nearest 100 ms so 1450 ms reads as `1.5s`
    rather than the `1.4s` that `(ms/1000).toFixed(1)` yields in binary floating
    point.
* Proving tests: `src/services/__tests__/workflowExecutions.test.js` (12 tests) —
  asserts the query hits `workflow_execution_logs` and selects `status` and
  `error_message`, the normalisers, the `PGRST205` fallback, and that `42501`
  throws without a second query. `src/components/admin/WorkflowExecutionLog.test.jsx`
  (6 tests, 5 new) — a failed run shows its `error_message`, a completed run its
  step counts, filtering by status, and a legacy row is labelled UNKNOWN rather
  than SUCCESS.

---

## 3. Post-update verification

| Check | Result |
| --- | --- |
| `npx eslint .` | exit 0, no output (0 errors, 0 warnings) |
| `npm test` (`vitest run --coverage`) | `Test Files 113 passed | 2 skipped (115)`, `Tests 667 passed | 9 skipped (676)`, 0 failures |
| `npx wrangler deploy --dry-run -c wrangler.toml` | clean, 32.79 KiB / gzip 8.09 KiB |
| `npx esbuild src/index.js --bundle` | clean, 11.6 KB |
| `npx wrangler deploy --dry-run` (mcp-bridge) | clean, 40.63 KiB / gzip 9.74 KiB |
| `deno check` | not run — Deno is not installed in this environment |

New tests added this wave: 83 (`workflowNodeConfig` 38, `WorkflowNodeInspector`
22, `workflowExecutions` 12, `WorkflowBuilder` +6, `WorkflowExecutionLog` +5).
Net: 584 → 667 passing, three new test files. No existing test was changed.

## 4. Files changed

| File | Change |
| --- | --- |
| `src/utils/workflowNodeConfig.js` | **new** — action-node config contract, validation, defaults, type switching (330 lines) |
| `src/utils/workflowNodeConfig.test.js` | **new** — 38 tests |
| `src/components/admin/WorkflowNodeInspector.jsx` | **new** — schema-driven config panel (~300 lines) |
| `src/components/admin/WorkflowNodeInspector.test.jsx` | **new** — 22 tests |
| `src/components/admin/WorkflowBuilder.jsx` | node selection, inspector panel, node data writes, delete, pre-dispatch validation gate, action-type seeding |
| `src/components/admin/WorkflowBuilder.test.jsx` | stateful React Flow stub + 6 tests for the new wiring |
| `src/services/supabaseApiService.js` | `getWorkflowExecutions()` reads `workflow_execution_logs`; legacy fallback; row normalisers |
| `src/services/__tests__/workflowExecutions.test.js` | **new** — 12 tests |
| `src/components/admin/WorkflowExecutionLog.jsx` | renders status / run id / duration / step counts / abort reason |
| `src/components/admin/WorkflowExecutionLog.test.jsx` | 5 new tests |
| `AGENTS_VERIFICATION.md` | this appendix |
| `CHANGELOG.md` | Wave 126 entry |
| `Continued Development Plan.md` | items 2 and 3 marked done, next priorities restated |
| `DEBUGGING_NOTES.md` | runtime facts found this cycle (perimeter drift, suite duration, `resumeWorkflow` contract) |

No migration was added this wave: the two tables the new code reads and writes
(`workflow_execution_logs`, `robot_simulation_runs`) were provisioned in
`20281101010000_workflow_definition_and_execution_logs.sql` under wave 125, with
RLS forced and writes revoked from `anon`/`authenticated`.

## 5. Residual risks and carried-forward items

1. **`resumeWorkflow()` has no producer for `status === 'paused'`.**
   `src/services/workflows/engine.js:352-364` looks for a paused run in
   `getWorkflowExecutions()` and reads `runData.context` / `paused_at_step`.
   `workflow_execution_logs.status` is constrained to `('completed','failed')`,
   and the normalised shape exposes `execution_context`, not `context`. This was
   already unreachable before this wave (legacy event rows never carried a
   `status` either), so nothing regressed — but the path cannot work as written
   and needs either a `paused` state on the table or removal of the branch.
2. **Three robotics Edge Functions and two MCP functions are routed but absent.**
   `cloudflare-workers/src/index.js:52-65` maps
   `/api/v1/robotics/{projects,sim,fleet/emergency-stop}` and
   `/api/v1/mcp{,/sse,/message}` to `robotics-projects`, `robotics-sim`,
   `robotics-emergency-stop`, `mcp-router`, `mcp-sse`, `mcp-message`; none of the
   six exists in `supabase/functions/`. Requests return Supabase's 404, not the
   worker's. Unchanged from wave 125 and listed as the next cycle's first item.
3. **`robot_simulation_runs` has no consumer.** The `robot_sim_run` action queues
   rows with `status='queued'`; nothing drains them. Also carried forward.
4. **Perimeter ingress does not point at this worker** (see 0.1). Requires DNS /
   Cloudflare route changes in the account, which no repository change can make.
5. **No Deno type-check.** `deno check` cannot run here, so
   `_shared/workflowActions.ts` and the functions that import it are covered only
   by the Vitest suites (`tests/workflow-actions.test.js`), not by the Deno
   compiler. Unchanged from wave 125.

---

# Archive

## Verification for AXiM Core Wave 125 — Workflow Persistence, Real Action Dispatch, Edge Ingress Hardening

Execution window: 2026-11-01, 03:04–04:00 America/Chicago (UTC-06:00)
Branch base: `3d03da7` (fix(deps): patch two critical runtime CVEs in cloud/)
Branch: `feat/core-wave-125-workflow-persistence-and-ingress`

This appendix follows the Proof-of-Fix protocol in `AGENTS.md` §0: for every
defect, the target file and line range, the exact change, and the test that
failed before it and passes after. Every claim below was produced by inspecting
the repository, not by reading prior notes.

---

### 0. Baseline findings (Phase 1)

Commands run against the clean tree at `3d03da7`, before any edit:

| Check | Result |
| --- | --- |
| `git status` | clean, on `fix/deps-runtime-criticals` |
| `npx eslint .` | 0 errors, 7 warnings (`react-refresh/only-export-components` in `src/contexts/*`) |
| `npx vitest run` | **48 suites failing** — every React Testing Library suite (see D1) |
| `npx esbuild src/index.js --bundle` (cloudflare-workers) | OK, 8.8 KB |
| `npx wrangler deploy --dry-run -c wrangler.toml` | OK, 30.11 KiB / gzip 7.25 KiB |
| `deno check supabase/functions/*` | not runnable — Deno is not installed in this environment |

Two of those are workspace defects, not environment noise, and were fixed before
any forward work (Cardinal Rule 2: zero progress on a broken build).

#### D1 — `npm test` result depended on the caller's shell

* Target: `vitest.config.js:19`
* Failure: `Error: act(...) is not supported in production builds of React.` in
  every RTL suite (`ApprovalQueue`, `WorkflowBuilder`, `ApiContext`,
  `ConnectivityContext`, `DashboardContext`, `useApi`, `MetricsGrid`,
  `SystemAutonomyMap`, `command-hub`, …). Root cause: this shell exports
  `NODE_ENV=production`; Vitest honours an ambient `NODE_ENV` instead of forcing
  `test`, so Vite resolved `node_modules/react/cjs/react.production.min.js`.
* Change: pin the value inside the config so the result cannot depend on the
  invoking shell.

```js
test: {
  env: { NODE_ENV: 'test' },
```

* Proving run: `NODE_ENV=production npx vitest run src/components/layout/ApprovalQueue.test.jsx`
  → 4 failed before, 4 passed after.

#### D2 — lint never reached 0 warnings

* Target: `eslint.config.js:68`, `src/contexts/ConnectivityContext.jsx:7,15`
* Failure: 7 × `react-refresh/only-export-components` in `src/contexts/*.jsx`.
  Those files legitimately export a Provider component together with its
  `useX()` hook; the rule targets component-only modules and cannot see that.
* Change: scope the rule off for `src/contexts/**` with the rationale recorded in
  the config, and drop the two now-redundant `eslint-disable` directives in
  `ConnectivityContext.jsx` (keeping them would produce
  "unused eslint-disable directive" warnings under `--report-unused-disable-directives`).
  `coverage` was also added to `ignores` — the generated report scripts tripped
  the same directive warning after any `npm test --coverage` run, so lint was
  only clean on a machine that had never generated coverage.
* Proving run: `npx eslint .` → `✖ 7 problems (0 errors, 7 warnings)` before,
  no output (exit 0) after.

---

### 1. Visual workflow builder could never load or save a graph

#### 1a. `definition` column did not exist

* Target: `supabase/migrations/20281101010000_workflow_definition_and_execution_logs.sql:1-40`
* Ground truth: `workflows_ax2024` is created at
  `20250101000000_consolidated_schema.sql:98` with `(id, name, description, slug,
  created_at, user_id)` only. No migration anywhere adds `definition`, yet
  `supabaseApiService.getWorkflows()` selects it, `createWorkflow()` writes it and
  `trigger-workflow` reads `workflow.definition`. Every round-trip fails with
  Postgres `42703 undefined_column`.
* Change: `ALTER TABLE ... ADD COLUMN IF NOT EXISTS definition JSONB NOT NULL
  DEFAULT '{"nodes": [], "edges": []}'::jsonb`, `updated_at`, a defensive backfill
  for NULL rows, and an owner-write RLS policy (`auth.uid() = user_id`) so a
  non-admin can persist their own flow without widening anyone else's access.

#### 1b. `saveWorkflow()` did not exist

* Target: `src/services/supabaseApiService.js:552-620`
* Failure: `WorkflowBuilder.jsx` calls
  `supabaseApiService.saveWorkflow(...)`. No such method existed on the service,
  so every "Save Workflow" click threw `TypeError: ... is not a function`,
  surfaced as the toast "Failed to save workflow.", and wrote nothing. The
  existing component test masked it by mocking the entire service.
* Change: implement `saveWorkflow(workflow, userId)` — update in place when an id
  is present, otherwise insert with a derived slug (`buildWorkflowSlug`) and one
  retry with a suffixed slug on `23505` so a same-named flow is never
  overwritten. `getWorkflows()` now also selects `id` (`:525-540`), without which
  a loaded workflow could not be addressed for update and each save inserted a
  duplicate row.

#### 1c. The builder persisted PII-scrubbed definitions

* Target: `src/components/admin/WorkflowBuilder.jsx:455`,
  `src/utils/workflowDefinition.js:1-160`
* Failure: the save handler ran `sanitizePayload({ nodes, edges })`
  (`src/utils/sanitization.js`). That scrubber replaces any key matching
  `password|token|secret|api_key|email|phone|street_address|name` with
  `[REDACTED]`. Applied to a workflow definition it silently blanks every action
  node's configuration — an `email` node loses `config.email`, an `api_call` node
  loses `config.api_key` / `config.token`.
* Change: new pure module `src/utils/workflowDefinition.js` with
  `serializeWorkflowDefinition` (drops React Flow runtime decoration, keeps
  `id/type/position/data` verbatim, discards edges pointing at removed nodes),
  `normalizeWorkflowDefinition`, `deserializeWorkflowDefinition` and
  `isRunnableDefinition`. The builder uses `serializeWorkflowDefinition` on save
  and `deserializeWorkflowDefinition` on load — replacing the
  `// In real app we parse definition from db, here we just mock` stub at
  `WorkflowBuilder.jsx:268-281`, which previously rehydrated a fixed two-node
  canvas for every saved workflow.

* Proving test: `src/services/__tests__/workflowPersistence.test.js` (15 tests).
  It asserts the definition round-trips, that `config.api_token` survives
  serialization, and — in the same test — that `sanitizePayload` would have
  redacted it, documenting the regression vector.
  Before: `supabaseApiService.saveWorkflow` was `undefined` (first test fails).

---

### 2. `trigger-workflow` ran with a service-role client and no authentication

* Target: `supabase/functions/trigger-workflow/index.ts:56-131`,
  `supabase/functions/_shared/workflowAuth.ts:1-245`
* Failure: the function had no auth check at all. Anyone able to reach
  `/functions/v1/trigger-workflow` could execute any workflow, which in turn
  writes to Postgres, sends email and performs outbound HTTP. The three
  in-repo callers authenticate differently (`job-processor` and
  `universal-dispatcher` send `Bearer $SUPABASE_SERVICE_ROLE_KEY`,
  `WorkflowBuilder` sends the user's session JWT).
* Change: `resolveWorkflowCaller` accepts exactly three shapes — an HMAC-SHA256
  signature over the raw body with `AXIM_INTERNAL_KEY` plus a fresh
  `X-Axim-Timestamp` (≤ 300 s), a bearer machine credential
  (`AXIM_INTERNAL_KEY` / `AXIM_SERVICE_KEY` / `SUPABASE_SERVICE_ROLE_KEY`), or a
  Supabase JWT that `auth.getUser()` resolves. A presented-but-invalid signature
  is terminal rather than falling through to a weaker path. `resolveActingUserId`
  stops a JWT caller from naming someone else's `userId`, and `coerceUuidOrNull`
  keeps the log insert alive when an internal caller sends the sentinel
  `userId: 'system'` into a UUID column.
* Proving test: `tests/workflow-auth.test.js` (19 tests) — stale timestamp with a
  *correct* HMAC is rejected; signature is bound to the exact body bytes; junk
  signature + valid bearer is still rejected; each machine credential path
  resolves; `user-b` cannot be substituted by `user-a`.

Also corrected at the caller end: `src/services/onyxAI/commands/workflowCommands.js:20-52`
sent `Authorization: Bearer ${VITE_AXIM_SERVICE_KEY}`, i.e. a service credential
shipped in the browser bundle and `undefined` in any deployment that does not set
it. It now calls `supabase.functions.invoke('trigger-workflow', …)` so the
caller's own session JWT is attached and the `user_jwt` path applies.

---

### 3. Action nodes were fabricated successes; the run was always "completed"

* Target: `supabase/functions/_shared/workflowActions.ts:1-428`,
  `supabase/functions/trigger-workflow/index.ts:240-312`
* Failure: every `action` node resolved to
  `result = { message: `Action ${node.data?.label} executed` }` — no HTTP call,
  no email, no robotics dispatch — and the execution row was written with
  `status: 'completed'` unconditionally, even after `break`-ing out of the DAG on
  a failed node.
* Change: typed dispatch for `api_call` (SSRF-guarded via
  `_shared/ssrf.ts:assertPublicUrl`, 10 s default timeout), `email` (through the
  injected `EmailDispatchManager`), `robot_sim_run`, `robot_policy_gate` and
  `robot_ota_deploy`. Unknown or untyped action nodes now throw instead of
  reporting success. `deriveExecutionStatus` returns `failed` whenever the run
  aborted, and the response carries `status`, `error`, `execution_logged` and
  `authenticated_via`.
* Supporting schema: `robot_simulation_runs` added in the same migration
  (`:108-152`) — the robotics schema had no table for a queued simulation, which
  is why `robot_sim_run` had nothing real to do.
* Proving test: `tests/workflow-actions.test.js` (23 tests) — SSRF guard runs
  before `fetch`; non-2xx throws; missing `config.to` throws; policy gate fails
  closed with no registered policy; OTA deploy writes the registry row *and*
  moves the targeted fleet nodes.

---

### 4. Edge worker: shared CORS state, no CGI/traversal shielding, missing health route

* Target: `cloudflare-workers/src/index.js:1-379`
* Failure, three separate defects:
  1. `corsHeaders` was a module-level object mutated per request
     (`corsHeaders['Access-Control-Allow-Origin'] = origin`). In a Workers isolate
     that object is shared by every request the isolate serves, so request *n+1*
     inherited request *n*'s reflected origin when it arrived without an `Origin`
     header.
  2. No CGI argument-injection or traversal screening: `?-d`,
     `auto_prepend_file`, `auto_append_file`, `allow_url_include`,
     `disable_functions`, `safe_mode`, `..`, `%2e%2e`, `.php`, `/wp-admin` were
     proxied straight to the origin.
  3. `/api/v1/health` was not routed. It fell into the `/api/` proxy branch, hit
     `apiRoutes.get()` → `undefined`, and returned 404 "API route not found".
* Change: `buildCorsHeaders()` returns a fresh object per request;
  `isBlockedIngress()` screens the raw and percent-decoded path + query and
  answers 403 before any proxy; `evaluateReplayHeader()` rejects a
  present-but-stale `X-Axim-Timestamp` (401) or an unparseable one (400) at the
  edge — absence is still tolerated because not every satellite signer emits the
  header yet (see `telemetry-ingress/index.ts:105`); `/api/v1/health` answers 200
  and `/health` keeps its historical 202 for existing monitors.
* Proving test: `tests/edge-ingress-hardening.test.js` (21 tests), including a
  three-request sequence that only passes if per-request CORS has replaced the
  shared object.

---

### 5. Verification commands and output

```
$ npx eslint .
(no output — 0 errors, 0 warnings)

$ cd cloudflare-workers && npx esbuild src/index.js --bundle --format=esm --outfile=/tmp/worker-bundle.js
  ../../../../tmp/worker-bundle.js  8.8kb  ⚡ Done in 161ms

$ cd cloudflare-workers && npx wrangler deploy --dry-run -c wrangler.toml
  Total Upload: 32.79 KiB / gzip: 8.09 KiB
  env.SUPABASE_URL ("https://pvbcdndqjguzqeafhwhw.supabase...")   Environment Variable
  env.ALLOWED_ORIGINS ("https://axim.us.com,http://localhost:...") Environment Variable
  --dry-run: exiting now.

$ npx vitest run tests/edge-ingress-hardening.test.js
  ✓ tests/edge-ingress-hardening.test.js  (21 tests)

$ npx vitest run tests/workflow-auth.test.js
  ✓ tests/workflow-auth.test.js  (19 tests)

$ npx vitest run tests/workflow-actions.test.js
  ✓ tests/workflow-actions.test.js  (23 tests)

$ npx vitest run src/services/__tests__/workflowPersistence.test.js
  ✓ src/services/__tests__/workflowPersistence.test.js  (15 tests)

$ npm test                  # = vitest run --coverage, the canonical command
  Test Files  110 passed | 2 skipped (112)
  Tests       584 passed | 9 skipped (593)
  (coverage report written to ./coverage, which is gitignored)
```

The two skipped files are pre-existing skips carried over from the baseline:
`src/components/admin/EcosystemRegistry.test.jsx` (3) and
`src/services/onyxAI/commands/__tests__/workflow.test.js` (4).

Two pre-existing flaky assertions were repaired because they made "is the build
green" unanswerable: `tests/e2e-workflow.test.js` asserted an absolute
`maxLatency < 150ms` on 40 simulated timers (measured 157ms and 226ms under CPU
contention although the code was fine — replaced with a concurrency assertion
that total wall clock stays below the sum of dispatch latencies), and
`src/services/onyxAI/commands/__tests__/network.test.js` pinned a 24h-old device
against `formatDistanceToNow`, which is always "about 23 hours ago" at the
moment of assertion (now 36h). The same test also caught `networkCommands.js`
joining the device list with a literal backslash-n instead of a newline.

Edge functions were syntax-verified with `npx esbuild <file> --format=esm`
(`_shared/workflowAuth.ts`, `_shared/workflowActions.ts`,
`trigger-workflow/index.ts` — all OK). `deno check` and `deno lint` could not be
run: the Deno runtime is not installed in this environment. That gap is recorded
as a follow-up rather than silently skipped.

---

### 6. Known gaps left open (documented, not fixed this cycle)

1. `cloudflare-workers/src/index.js` routes `/api/v1/robotics/projects|sim|fleet/emergency-stop`
   to `robotics-projects`, `robotics-sim`, `robotics-emergency-stop` — **none of
   those Edge Functions exist** in `supabase/functions/`. Those three routes 404
   at the origin today.
2. `src/services/supabaseApiService.getWorkflowExecutions()` (`:770-786`) reads
   `events_ax2024`, while `trigger-workflow` now writes
   `workflow_execution_logs`. The History tab therefore shows legacy event rows
   only; reconciling the read path is the next scoped task.
3. `robotics-sim` has no runner: `robot_sim_run` queues a
   `robot_simulation_runs` row with `status='queued'`; nothing drains it yet.
4. `tests/edge-worker.test.js` still contains `expect(true).toBe(true)`
   placeholders (superseded by `tests/edge-ingress-hardening.test.js`, but not
   removed here to keep this change set additive).
