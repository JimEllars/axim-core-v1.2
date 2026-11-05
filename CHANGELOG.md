# Changelog

## [2026-11-05] Give the MCP surface an implementation, and stop copying a broken schema

`cloudflare-workers/src/index.js` has proxied six routes at three Edge Functions that did
not exist. Every one answered Supabase's 404, listed in `tests/edge-routes.test.js` under
`NOT_YET_BUILT` so the gap stayed visible:

| route | target |
|---|---|
| `/mcp`, `/api/v1/mcp` | `functions/v1/mcp-router` |
| `/sse`, `/api/v1/mcp/sse` | `functions/v1/mcp-sse` |
| `/message`, `/api/v1/mcp/message` | `functions/v1/mcp-message` |

So every MCP client aimed at the Core domain — Onyx, Claude Desktop, Cursor, a satellite
relay — got a 404 with nothing behind it.

### Added

- **`supabase/functions/mcp-router`**, **`mcp-sse`**, **`mcp-message`.** JSON-RPC 2.0 over
  Streamable HTTP (single message or batch), an SSE handshake with a bounded keepalive
  stream, and a session-bound message endpoint. `initialize` / `ping` / `tools/list` /
  `tools/call`, protocol versions `2025-06-18`, `2025-03-26` and `2024-11-05`.
- **Five tools** with JSON Schema contracts: `core_health_check`, `telemetry_lookup`,
  `hitl_queue_status`, `axim_list_nodes`, `axim_dispatch_task`.
- **`_shared/mcpProtocol.ts`** (348 lines), **`_shared/mcpTools.ts`** (392),
  **`_shared/mcpSession.ts`** (203), **`_shared/mcpSupabase.ts`** (114),
  **`_shared/mcpServer.ts`** (139). Pure, dependency-injected, tested under Node.
- **63 tests** across `tests/mcp-tools.test.js` (17), `tests/mcp-protocol.test.js` (24),
  `tests/mcp-session.test.js` (13), `tests/mcp-supabase.test.js` (9).

### Fixed

- **The tool column contracts are taken from the migrations, not from the MCP bridge.**
  The bridge ships `axim_dispatch_task` inserting `action_name`, `payload`, `requested_by`
  and `created_at` into `public.hitl_audit_logs`, whose columns are `admin_id`, `action`,
  `tool_called`, `status`, `target_department`, `timestamp` — none of those four exist.
  Its `hitl_queue_status` selects `action_name` and filters `status = 'pending'` when the
  default is `'Pending'`. Its `telemetry_lookup` selects `severity`/`component_id`/`message`
  from a `telemetry_events` that is `id, app_id, event_type, metadata, created_at`.
  Every one of those calls is a PostgREST 400 reported as a bare `Error: 400`.
- **`axim_dispatch_task` refuses internal callers.** `hitl_audit_logs.admin_id` is
  `NOT NULL REFERENCES auth.users(id)`, so a service key or HMAC relay has no identity to
  attribute a row to. The bridge's answer was a literal `requested_by` string in a column
  that does not exist.
- **`tests/api-gateway.test.js` no longer fails on a slow runner.** One test timed out at
  Vitest's 5 s default while costing 7.9 s, all of it the two dynamic `import()`s that pull
  the `apiProxy` module graph through esbuild inside jsdom. Explicit 20 s timeout, with the
  measurement in a comment.

### Fixed (CI)

- **`Deploy Edge Functions` reported success having deployed nothing.** The workflow merged
  in PR #498 ran on `main` (41986445329) and went green with `deploy`, `smoke` and
  `critical-contracts` all **skipped**, because `SUPABASE_ACCESS_TOKEN` is not provisioned
  on this repository — measured against production afterwards, all 80 functions still
  answer `{"code":"NOT_FOUND"}`. Skipped jobs do not fail a run, and the only step summary
  lived inside the skipped job, so the run had no summary at all. A new `report` job with
  `if: always()` writes the real outcome to the run summary, distinguishes
  `NOT DEPLOYED — no credentials` from `deployed`, and names the remediation. It does not
  fail the merge: a missing secret is an operator action, not a reason to block every pull
  request. **Provisioning that secret is the remaining action item on this wave.**
- **`tests/edge-deploy-workflow.test.js` (5 tests)** pins the guarantee so the silent
  success cannot return.

### Security

- **Anonymous callers are refused on every MCP method**, including `initialize` and the
  discovery document, through the shared `classifyEdgeCaller`. A tool inventory is a map of
  the deployment, and an open MCP endpoint is an open query interface onto telemetry, HITL
  approvals and the satellite registry.
- **Sessions are HMAC-signed tokens with no server state** — `v1.<payload>.<hmac>` over
  `AXIM_INTERNAL_KEY`. The signature is checked before `exp` is read, so a forged
  far-future token cannot pass by looking fresh; `mcp-message` then requires the session
  subject to match the presented caller. With no key configured the entrypoints answer
  503 rather than minting tokens that verify against nothing.

### Documentation

- `AGENTS_VERIFICATION.d/2026-11-05-wave131-mcp-edge-surface.md` — the full appendix,
  including the migration citations for every column and the reasoning behind each
  refusal.

## [2026-11-04] Deploy the edge functions that were never deployed

`reusable-deploy-supabase.yml` has been correct since it was written and has never
once run: no workflow in this repository calls it. Nothing was watching, so nothing
noticed.

Measured against production on 2026-11-04 — of 80 directories under
`supabase/functions/`, **8 are deployed and 72 return 404**:

| | |
|---|---|
| **live** | `api-gateway`, `create-checkout-session`, `create-portal-session`, `llm-proxy`, `robotics-emergency-stop`, `robotics-sim-drainer`, `trigger-workflow`, `voice-ingest` |
| **absent** | the other 72, including the three the wider ecosystem is blocked on: `telemetry-ingress`, `resolve-hitl`, `onyx-bridge` |

The eight that are live are the functions declared `verify_jwt = false` in
`supabase/config.toml`, plus `llm-proxy`, which is no longer declared there — a stale
deployment. They were pushed by hand, one at a time, as each was needed.

Three functions in particular have consequences outside this repo:

- **`telemetry-ingress`** is the DLQ replay target named by `CORE_INGEST_URL` in
  Onyx Mk3's edge bridge. Its absence is why the edge DLQ never drains.
- **`resolve-hitl`** is `CORE_HITL_URL`. Onyx Mk3 has been calling it since the HITL
  workflow landed, so human-in-the-loop approvals have never once worked.
- **`onyx-bridge`** is called by name from the Support System worker.

### Added

- **`.github/workflows/deploy-edge-functions.yml`.** Deploys on push to `main` when
  `supabase/functions/**` or `supabase/config.toml` change, plus a
  `workflow_dispatch` escape hatch that accepts a space-separated function list.
  `preflight` reads the project ref out of `supabase/config.toml` rather than
  duplicating it, and skips cleanly with a warning when `SUPABASE_ACCESS_TOKEN` is
  absent rather than failing every merge. `parse-gate` runs `check:creds` and
  `check:edge` before anything is pushed. `deploy` pushes function by function so a
  single bad source fails with a named culprit. `smoke` proves the deploy took.
  `critical-contracts` asserts the three ecosystem-blocking functions specifically.
- **`scripts/check-edge-deploy-gate.mjs` (22 assertions, read-only).** The smoke job
  decides *deployed or not* from the gateway's response body, not the status code,
  because a live function rejecting an unauthenticated caller answers `401` and a
  `verify_jwt = false` function answers `200` — neither distinguishable from
  "missing" by status alone. The gateway's own not-deployed body is unambiguous
  (`{"code":"NOT_FOUND","message":"Requested function was not found"}`). This
  script asserts that discriminator holds, using a nonexistent name as the control
  and three known-live functions as the negative case. If the platform ever changes
  the shape, the gate fails here instead of silently passing everything.

### Why the existing gates did not catch this

`verify-smoke-tests.yml` probes two endpoints and treats `404` as a **warning**:

```
echo "Warning: api-gateway returned 404. Edge function might not be deployed yet in this environment."
```

That is the whole defect, encoded as policy. Its unit-test step is also a stub —
`scripts/smoke-test-functions.js` contains only
`console.log("Mock smoke test execution successful.")`. The new `smoke` job inverts
the policy: after a deploy, a function the run just deployed that the gateway still
cannot route to is a hard failure.

### Known defect, deliberately not fixed here

`supabase/functions/dead_letter_jobs/` is a real DLQ retry worker, but its directory
name contains an underscore. Supabase function slugs are `[a-z0-9-]` only, so it
cannot deploy under its own name — verified `404` at the gateway. Renaming the
directory changes the deployed function name, and it is invoked by something outside
this repository that is not visible from here. It is excluded from the deploy set with
a `::notice::` and exempted in the gate script by name, so it stays visible rather
than silently skipped. Fix it when the rename and its invoker can be changed together.

### Verified

`node scripts/check-edge-deploy-gate.mjs` → 22 assertions, **PASS**, against the live
project. Deploy-set resolution simulated locally: 79 functions, `_shared` and
`dead_letter_jobs` both correctly excluded. Not verified: an actual deploy — the
workflow is the mechanism, and `critical-contracts` is what proves it.

## [2026-11-04] Wave 130 — the robotics API the worker already routed to, a consumer for the simulation queue, and a pause/resume path that finally round-trips

Two gaps left behind by Waves 125–129.

`cloudflare-workers/src/index.js` has mapped `/api/v1/robotics/projects`,
`/api/v1/robotics/sim` and `/api/v1/robotics/fleet/emergency-stop` at
`functions/v1/robotics-projects`, `robotics-sim` and `robotics-emergency-stop` since the
robotics schema landed. None of those functions existed, so every robotics API call
reached Supabase's 404. Separately, `robot_sim_run` action nodes inserted
`robot_simulation_runs` rows with `status = 'queued'` and nothing in the repository read
that table.

### Added
- **`robotics-projects`** — `GET` list (optionally by id), `POST` create against `robot_projects`.
- **`robotics-sim`** — `GET` runs, `POST` queue. Mirrors what `runRobotSim()` in
  `_shared/workflowActions.ts` writes, so a run queued from the API and one queued from a
  workflow are indistinguishable to the consumer.
- **`robotics-emergency-stop`** — halts `robot_fleet_nodes` for a project or an id list, then
  writes one `robot_fault_logs` row per node. Fleet rows are stopped *before* the audit
  insert, so a partial failure leaves robots stopped rather than moving.
- **`robotics-sim-drainer`** — the queue consumer. Claims atomically via
  `claim_robot_simulation_runs` and dispatches each run to `ROBOTICS_SIM_ENDPOINT`.
- **`_shared/robotics.ts`** — contracts, validation and operations. No `Deno.*` access,
  collaborators injected, so the whole surface is unit tested under Node.
- **`_shared/edgeCaller.ts`** — the caller-classification rule `trigger-workflow` grew
  privately in Wave 128, in one place. A presented `X-Axim-Signature` must verify and a bad
  one is terminal: it never downgrades to the bearer check.
- **Migration `20281104000000`** — `claimed_at`, `claim_robot_simulation_runs`
  (`FOR UPDATE SKIP LOCKED`, `service_role` only) and `reap_stale_robot_simulation_runs`.

### Fixed
- **`resumeWorkflow()` could never succeed.** Five breaks on one path: the `status` CHECK
  forbade `paused`; the writer put pauses in `events_ax2024` while the reader read
  `workflow_execution_logs`; `normalizeExecutionLogRow()` coerced `paused` to `completed`;
  the resume read `context` where the row has `execution_context`; and `runWorkflow()`
  generated a fresh run id on resume, leaving the original row `paused` for ever so
  `listenForWorkflowEvents()` re-resumed it on every event.
- `logWorkflowExecution()` now dual-writes, keeping the `events_ax2024` row that four
  dashboard RPCs count `workflows_triggered` from.
- `api.logWorkflowExecution()` forwards `userId`, which the engine had been passing and the
  facade had been dropping.
- Migration `20281104000001` widens `workflow_execution_logs.status` to
  `('completed','failed','paused')` and adds `paused_at_step` / `paused_at`.
- The two existing pause/resume tests mocked `context`, a field the table does not have,
  which is why they passed while the feature was entirely broken.

### Deliberate non-successes
- With no `ROBOTICS_SIM_ENDPOINT` configured the drainer answers **503 with the queue depth**
  and claims nothing. Marking rows `failed` because an env var is unset would destroy
  queued work to report a configuration gap.
- A simulator 2xx with an unreadable body is `failed`, not `completed`.
- A stop request that matched no node reports `stopped: 0` rather than a cheerful 200.

## [2026-11-03] Wave 129 — Waves 125 + 126 rebased and landed: visual workflow parity, typed action dispatch, real execution history

Waves 125 and 126 had been pushed to origin for days with no PR — invisible work cut
before the tenancy (#491), versioned-signature (#492) and trigger-auth (#494/#495) work
merged. A straight merge would have dropped all of that. This change rebases both onto
current main, reconciles every overlap by contract, and opens the PR.

### Added
- **Workflow persistence** — `workflows_ax2024.definition` column, a `workflow_execution_logs`
  table, and a `robot_simulation_runs` table (migration `20281101010000`), all idempotent and RLS-locked.
- **Real action-node dispatch** — `_shared/workflowActions.ts` executes `api_call`
  (SSRF-guarded), `email`, `robot_sim_run`, `robot_policy_gate` and `robot_ota_deploy`; an
  unsupported or failed node halts the run and marks the execution `failed` instead of
  fabricating success.
- **Typed node inspector** — `WorkflowNodeInspector.jsx` + `src/utils/workflowNodeConfig.js`
  author the config the runner expects; "Run Workflow" refuses to dispatch a graph the
  runner would halt on.
- **Real execution history** — `getWorkflowExecutions()` reads `workflow_execution_logs`
  with a `42P01`/`PGRST205`-only fallback to the legacy event stream; `status` and
  `error_message` surface in the History tab.

### Reconciled with the trunk (not stacked on it)
- `_shared/workflowAuth.ts` keeps main's `authorizeTrigger` contract verbatim and drops the
  branch's duplicate HMAC/replay crypto — `edgeAuth.verifySignedRequest` already owns it.
- `trigger-workflow` uses one classifier: a presented `X-Axim-Signature` must verify
  (terminal), otherwise `resolveCaller` handles service keys and dashboard JWTs.
- `workflowCommands.js` uses main's `sessionAuthHeaders` browser path plus the branch's
  `success === false` guard and a step/duration summary.
- `tests/e2e-workflow.test.js` keeps main's stub deletion rather than resurrecting it.

### Fixed
- `WorkflowBuilder.test.jsx` heavy action-node tests exceeded vitest's 5s default on a
  constrained sandbox; the 30s timeout is scoped to that describe block.
- `vitest.config.js` pins `NODE_ENV: 'test'` so an ambient `production` env can no longer
  resolve React's production build and break every `act()` call.

## [2026-11-02] Wave 128 — the last unauthenticated Core entry point, and the credential fallbacks that guarded it

`trigger-workflow` runs with the service role key and `supabase/config.toml` sets
`verify_jwt = false` for it, so the platform checks nothing and the function decided
nothing: an anonymous `POST` could enumerate any workflow, execute every node, write an
execution row, and attribute it to whatever `userId` the body claimed. The same class of
hole as the AI surface closed in #489, on the one endpoint that can run arbitrary action
graphs.

The fallbacks that were supposed to protect the surrounding services were themselves
credentials. `universal-dispatcher` accepted
`Deno.env.get("AXIM_SERVICE_KEY") || "fallback_internal_key"`, and the same literal was
compiled into the browser bundle — the client and the server authenticated each other
with a string that anyone can read out of the deployed JS.

### Fixed
- **`supabase/functions/trigger-workflow/index.ts`** — resolves the caller before it reads
  the body: internal service key, verified user token, or anonymous. Anonymous gets 401.
  The run identity comes from the caller's credentials, not from `body.userId`; a verified
  user naming anyone but themselves gets 403. `keysFromEnv()`/`resolveCaller()` are the same
  primitives #489 used, and every existing caller already sends credentials:
  `job-processor` and `universal-dispatcher` send the service-role bearer,
  `WorkflowBuilder.jsx` goes through `functions.invoke`.
- **`supabase/functions/universal-dispatcher/index.ts`** — the literal fallback is gone.
  Also accepts a verified operator, because the dashboard used to reach it with the
  fallback key. Outbound sibling calls go through `internalAuth()`, which throws when no
  internal key is configured instead of sending `Bearer undefined`.
- **`supabase/functions/roundups-connector/index.ts`** — no longer requires the raw
  service-role key (which is why the dashboard needed that key in the first place).
  Read-only actions accept a verified user; `launch_campaign` stays internal-only.
- **`supabase/functions/send-email/index.ts`** — accepts a verified operator token in
  addition to a micro-app session.
- **`supabase/functions/vault-upload/index.ts`**, **`omnichannel-publisher/index.ts`**,
  **`ground-game-assign/index.ts`** — `|| 'fallback_internal_key'` /
  `|| 'test_internal_key'` removed; a missing key now fails closed.
- **`supabase/functions/axim-content-engine/index.ts`** — its outbound
  `X-Axim-Internal-Service-Key` was `SUPABASE_SERVICE_ROLE_KEY || "test_internal_key"`; it
  now refuses to call `omnichannel-publisher` without a real key.
- **`supabase/functions/communication-gateway/index.ts`** — removed an unused constant that
  still shipped a guessable literal.
- **Browser** — `workflowCommands.js`, `integrationCommands.js`, `systemCommands.js`,
  `useCommandHandler.js`, `useVectorSearch.js`, `MemoryBank.jsx` and `ChatMessage.jsx` no
  longer authenticate with `VITE_SUPABASE_SERVICE_ROLE_KEY`, `VITE_AXIM_SERVICE_KEY` or a
  literal. A `VITE_*` secret is inlined into the public bundle, so the dashboard either
  shipped a full-database credential to every visitor or sent `Bearer undefined`.
  `troubleshootApp` no longer builds a second Supabase client inside the browser holding
  the service-role key.

### Added
- **`supabase/functions/_shared/workflowAuth.ts`** — the dispatch rule as a pure function:
  who may trigger, and which identity the run is recorded against.
- **`scripts/check-credentials.mjs`** (`npm run check:creds`) — text scan over
  `supabase/functions/` and `src/` for literal credential fallbacks and for service
  credentials read from client code. Comment-aware, position-preserving.
- **`tests/check-credentials.test.js`** — 10 tests: the real tree is clean, *and* each rule
  trips on a purpose-built fixture. A gate that can only go green is not a gate.
- **`tests/workflow-auth.test.js`** — 11 tests over the dispatch rule, including a verified
  user claiming the `system` actor.
- **`src/services/sessionAuth.js`** — one place that turns the current session into an
  `Authorization` header, so the pattern cannot drift again.

### Changed
- **`.github/workflows/verify-smoke-tests.yml`** — runs `npm run check:creds` on every pull
  request and push to `main`, next to `check:edge`.

## [2026-11-01] Wave 127 — un-unparsable Edge Functions, and a gate that keeps them parseable

Four of the 95 Deno Edge Function sources on `main` were invalid TypeScript, so
`supabase functions deploy` could not succeed for any of them. One of the four was a merge
conflict marker committed straight to `main` inside `_shared/edgeAuth.ts` — the module five
deployed functions import.

### Fixed
- **`supabase/functions/_shared/edgeAuth.ts`** — removed the conflict marker that merge
  `4dc7151` (PR #492) committed at lines 125–272. Both halves were kept: the tenancy helper
  `claimFromToken()` from #491 and the versioned-signature block from #492. This unblocks
  `telemetry-ingress`, `generate-embedding`, `memory-retrieval`, `onyx-sentinel` and
  `onyx-ui-stream`.
- **`supabase/functions/audit-export/index.ts`** — escaped backticks in two template
  literals made the file unparsable.
- **`supabase/functions/gateway-heartbeat/index.ts`** — `createClient` was imported inside
  the `serve()` handler instead of at the module head.
- **`supabase/functions/stream-webhook/index.ts`** — Postgres casts (`'true'::jsonb`) were
  written in TypeScript; the `system_status.value` column is jsonb, so plain JSON booleans
  are the correct payload.
- **`src/services/onyxAI/commands/__tests__/network.test.js`** — was red on `main`
  independently of this branch. The fixture used exactly 24 hours for "1 day ago", but
  date-fns 4.4.0 floors its hour count in the `xHours` branch, so 86400000 ms renders
  `about 23 hours ago` and `1 day` only appears from 24h+36h. Fixture moved to 26 hours.

### Added
- **`scripts/check-edge-syntax.mjs`** (`npm run check:edge`) — parses every file under
  `supabase/functions/` with esbuild, and reports committed conflict markers with line
  numbers. No Deno toolchain required, so it runs in the existing Node-only CI.
- **`tests/edge-syntax.test.js`** — 7 tests: the real tree parses, and the checker is proven
  to fail on conflict markers and on unparsable files, so the gate cannot rot.
- **`tests/edge-auth.test.js`** — 14 tests that import the real `edgeAuth.ts` and exercise
  both halves (v2 signature + replay window, legacy sunset, `claimFromToken` tenancy). The
  Deno test files for this module are not wired into any workflow and `deno` is not
  installed, so this is the only executed proof.

### Changed
- **`.github/workflows/verify-smoke-tests.yml`** — runs `npm run check:edge` on every pull
  request and push to `main`. A committed conflict marker can no longer merge into a Deno
  source unnoticed.
- **`vitest.setup.jsx`** — the global `window.matchMedia` mock is now guarded, so
  node-environment suites (which esbuild requires) can exist alongside jsdom ones.

## Wave 114: Reissuing Unlanded Correctness Fixes (#344)

Reissued unlanded fixes, added KV activation, updated CHANGELOG automation, and added BD/CRM tests.

## Wave 114: Reissuing Unlanded Correctness Fixes (#344)

Reissued unlanded fixes, added KV activation, updated CHANGELOG automation, and added BD/CRM tests.

## Unreleased
- **Added:** DeepSeek testing console active in `APITestConsole.jsx` for direct verification.
- **Changed:** Edge telemetry metrics in `CloudflareEdgeHealth.jsx` now rely on actual Postgres database payload (`telemetry_events`) avoiding randomization (mock data removed).
- Hardened Cloudflare Edge Telemetry & Backpressure Buffer with KV fallback and backoff jitter.
- Updated `telemetry.js` to ensure array sizing and local memory ring buffering limits.
- Improved AuthContext with silent token renewal to prevent state flickers.
- Fixed overlapping events in `PassportListener.jsx` and added strict lifecycle rules.
- Upgraded `CloudflareEdgeHealth` and `QueueDepthPanel` UI to align with enterprise design tokens and error boundary logic.
- Fallback timeout configurations provided for AI Providers.
- Refactored `JobQueueMonitor` to use real-time channels instead of aggressive polling.
- Updated Onyx AI routing with `executeCommandWithTimeout` to handle timeouts gracefully.
- Enhanced `job-processor` with non-blocking email dispatches.

## [1.2.1-wave-65] - 2026-09-10
### Added
- Live executive briefing dispatch and in-app preview capability within the Email Console.
- DLQ manual replay and "Replay All Pending" batch functionality in the Queue Depth Panel.
- Edge queue consumer fallback routing to `public.dead_letter_jobs` upon repeated insertion failures.
- Global `Cmd+K` keyboard shortcut and real-time filtering for the Ecosystem App Launcher.

### Changed
- Refined Cloudflare Edge Health component to capture and display CF-Ray ID and Colo routing data from live pings.
- Standardized UI elevation levels and applied cyber-grid backgrounds to the core CSS structure.
- Enhanced Command Hub chat interface to provide deterministic fallback feedback when the Onyx daemon disconnects.
## [1.1.0] - Sprint 1.3-Alpha Update
### Added
- Cloudflare edge worker telemetry buffering utilizing an exponential TTL fallback to `TELEMETRY_FALLBACK_KV`.
- Seamless offline payload queueing with `navigator.sendBeacon()` tracking implementation ensuring delivery limits stay under 64 KB.
- Universal Web3 and internal `idempotency-key` validation hooks implemented natively within `api-gateway` and `universal-dispatcher`.

### Changed
- Replaced polling intervals across dashboards (`CloudflareEdgeHealth`, `QueueDepthPanel`, `IntelligenceHub`) with event-driven `supabase.channel()` realtime sync.
- Improved WCAG AA dark-mode compliance across UI frames, optimizing `text-slate-400` boundaries with `border-zinc-800` to prevent washout.
- Deprecated manual load spinners for streamlined unified `animate-pulse` skeleton states on key data tables.

### Fixed
- Resolved Cloudflare Pages CI deployment failures by stripping unsupported worker-specific configurations (`assets`, `observability`) from `wrangler.jsonc` and updating `package.json` scripts to use `npx wrangler pages deploy`.
Fixed wrangler configuration, deduplicated imports, added robust UI session retention and verified Edge Telemetry, fixed component test errors and finished all requirements
