# Verification for AXiM Core Wave 125 — Workflow Persistence, Real Action Dispatch, Edge Ingress Hardening

Execution window: 2026-11-01, 03:04–04:00 America/Chicago (UTC-06:00)
Branch base: `3d03da7` (fix(deps): patch two critical runtime CVEs in cloud/)
Branch: `feat/core-wave-125-workflow-persistence-and-ingress`

This appendix follows the Proof-of-Fix protocol in `AGENTS.md` §0: for every
defect, the target file and line range, the exact change, and the test that
failed before it and passes after. Every claim below was produced by inspecting
the repository, not by reading prior notes.

---

## 0. Baseline findings (Phase 1)

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

### D1 — `npm test` result depended on the caller's shell

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

### D2 — lint never reached 0 warnings

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

## 1. Visual workflow builder could never load or save a graph

### 1a. `definition` column did not exist

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

### 1b. `saveWorkflow()` did not exist

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

### 1c. The builder persisted PII-scrubbed definitions

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

## 2. `trigger-workflow` ran with a service-role client and no authentication

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

## 3. Action nodes were fabricated successes; the run was always "completed"

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

## 4. Edge worker: shared CORS state, no CGI/traversal shielding, missing health route

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

## 5. Verification commands and output

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

## 6. Known gaps left open (documented, not fixed this cycle)

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
