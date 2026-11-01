# Changelog

## Wave 125 — 2026-11-01: Workflow persistence, real action dispatch, edge ingress hardening

Execution window: 2026-11-01 03:04–04:00 America/Chicago. Branch
`feat/core-wave-125-workflow-persistence-and-ingress`, based on `3d03da7`.

### Fixed
- **Visual workflow builder could neither load nor save a graph.**
  `workflows_ax2024` had no `definition` column while three call sites read and
  wrote one (Postgres `42703`). Added idempotently, with an owner-write RLS
  policy: `supabase/migrations/20281101010000_workflow_definition_and_execution_logs.sql`.
- **`supabaseApiService.saveWorkflow()` did not exist** — the builder called it on
  every save, so nothing was ever persisted. Implemented (insert / update-in-place
  with slug derivation and a `23505` retry). `getWorkflows()` now selects `id`,
  without which each save inserted a duplicate row.
- **Saved definitions were PII-scrubbed.** The builder ran
  `sanitizePayload()` over the graph, redacting any key containing
  token/secret/email/name and blanking every action node's configuration.
  Replaced with `src/utils/workflowDefinition.js` (serialize / normalize /
  deserialize), which keeps `data.config` verbatim and drops only React Flow
  runtime decoration.
- **`trigger-workflow` accepted anonymous requests with a service-role client.**
  Now requires an HMAC-SHA256 signature over the raw body with a fresh
  `X-Axim-Timestamp` (≤ 300 s), a machine bearer credential, or a resolvable
  Supabase JWT; a JWT caller may only act as its own user id.
- **Action nodes were fabricated successes.** `action` nodes returned
  `"Action <label> executed"` without doing anything, and runs were logged as
  `completed` even after a node failed. Added typed dispatch for `api_call`
  (SSRF-guarded, bounded timeout), `email`, `robot_sim_run`, `robot_policy_gate`
  and `robot_ota_deploy`; unknown types now fail the run.
- **`workflow_execution_logs` was never created** by any migration, so execution
  logging silently failed. Table provisioned (service-role writes only, owner and
  admin reads), plus `robot_simulation_runs` for the simulation action.
- **Edge worker CORS state was shared across requests.** A module-level header
  object mutated per request meant a reflected origin leaked into later requests
  in the same isolate. Headers are now built per request.
- **Edge worker had no CGI/traversal shielding.** `?-d`, `auto_prepend_file`,
  `auto_append_file`, `allow_url_include`, `disable_functions`, `safe_mode`, `..`,
  `%2e%2e`, `.php` and `/wp-admin` now return 403 before proxying; a stale
  `X-Axim-Timestamp` returns 401/400.
- **`GET /api/v1/health` returned 404.** It fell into the `/api/` proxy branch
  with no route mapping. Now answers 200 at the edge; `/health` keeps its 202.
- **`npm test` failed in any shell exporting `NODE_ENV=production`** — Vitest
  honoured the ambient value, React resolved its production build and refused
  `act()`, failing every RTL suite. `NODE_ENV` is now pinned in `vitest.config.js`.
- **ESLint could not reach 0 warnings.** Scoped
  `react-refresh/only-export-components` off for `src/contexts/**`, where a
  Provider and its `useX()` hook are intentionally co-located, and added
  `coverage` to the ignore list (the generated report scripts tripped
  `--report-unused-disable-directives` after any `npm test --coverage` run).

### Added
- `src/utils/workflowDefinition.js` — graph serialization for the builder.
- `supabase/functions/_shared/workflowAuth.ts` — HMAC/timestamp/bearer/JWT caller resolution.
- `supabase/functions/_shared/workflowActions.ts` — typed action-node dispatch.
- Tests: `tests/edge-ingress-hardening.test.js` (21),
  `tests/workflow-auth.test.js` (19), `tests/workflow-actions.test.js` (23),
  `src/services/__tests__/workflowPersistence.test.js` (15).

### Changed
- `src/services/onyxAI/commands/workflowCommands.js` no longer sends
  `VITE_AXIM_SERVICE_KEY` from the browser; it uses the caller's session JWT via
  `supabase.functions.invoke`.
- `src/services/onyxAI/commands/networkCommands.js` joins the device list with a
  real newline (it was emitting a literal `\n` and rendering one long line).
- `tests/e2e-workflow.test.js` and `src/services/onyxAI/commands/__tests__/network.test.js`
  carried two pre-existing flaky assertions (absolute wall-clock bound on
  simulated timers; a 24h fixture that `formatDistanceToNow` always renders as
  "about 23 hours"). Both now assert deterministic properties.

### Verification
- `npx eslint .` — 0 errors, 0 warnings.
- `npm test` (`vitest run --coverage`) — `Test Files 110 passed | 2 skipped
  (112)`, `Tests 584 passed | 9 skipped (593)`. The two skipped files are
  pre-existing skips.
- `npx wrangler deploy --dry-run -c wrangler.toml` — clean, 32.79 KiB / 8.09 KiB gzip.
- `npx esbuild src/index.js --bundle` — clean, 8.8 KiB.
- `deno check` not run: Deno is not installed in this environment.

### Known gaps (not addressed this wave)
- The worker routes `/api/v1/robotics/{projects,sim,fleet/emergency-stop}` to Edge
  Functions that do not exist in the repo.
- `getWorkflowExecutions()` still reads `events_ax2024` while the runner now writes
  `workflow_execution_logs`.
- `robot_simulation_runs` rows are queued but nothing drains them yet.
- `deno check` was not run: Deno is not installed in this environment.

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
