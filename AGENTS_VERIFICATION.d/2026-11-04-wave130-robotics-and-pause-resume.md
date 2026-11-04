# Wave 130 — the robotics functions the worker already routed to, and a consumer for the simulation queue

**Branch:** `feat/core-wave-130-robotics-functions-and-sim-queue`
**Base:** `6669ad3` (main, wave 129 / PR #496)
**Date:** 2026-11-04
**Scope:** four new Edge Functions, two shared modules, two migrations, three test files, and
the workflow pause/resume contract in `src/services/`.

---

## 1. Two gaps the previous waves left behind

### 1a. Three proxied routes answered 404

`cloudflare-workers/src/index.js:56-58` has mapped these since the robotics schema landed:

```js
['/api/v1/robotics/projects',                '/functions/v1/robotics-projects'],
['/api/v1/robotics/sim',                     '/functions/v1/robotics-sim'],
['/api/v1/robotics/fleet/emergency-stop',    '/functions/v1/robotics-emergency-stop'],
```

`ls supabase/functions/` before this change contained none of `robotics-projects`,
`robotics-sim` or `robotics-emergency-stop`. The worker proxied to Supabase, which
answered its own 404. The route table looked complete; every robotics API call failed.

### 1b. `robot_simulation_runs` was a write-only table

`_shared/workflowActions.ts:234-272` (`runRobotSim`) inserts a row with
`status: 'queued'` for every `robot_sim_run` action node and returns
`Simulation queued (...)`. Nothing in the repository read that table. The Continued
Development Plan carried this as the highest-value open increment:

> Build the three robotics Edge Functions the worker already routes to
> (`robotics-projects`, `robotics-sim`, `robotics-emergency-stop`) and a consumer that
> drains `robot_simulation_runs`. (`robot_sim_run` action nodes now queue rows with
> `status='queued'` and nothing picks them up — this is the highest-value next increment.)

## 2. What was added

| File | Lines | Purpose |
|---|---|---|
| `supabase/functions/_shared/robotics.ts` | 655 | Contracts, validation, the four operations and the queue consumer. No `Deno.*` access; collaborators injected. |
| `supabase/functions/_shared/edgeCaller.ts` | 197 | Caller classification (`hmac:v2` / `hmac:legacy` / `internal_key` / `user_jwt` / `anonymous`) plus the robotics authorisation rules. Lifts the rule `trigger-workflow` grew privately in Wave 128 into one place. |
| `supabase/functions/robotics-projects/index.ts` | 101 | `GET` list / `POST` create. |
| `supabase/functions/robotics-sim/index.ts` | 112 | `GET` runs / `POST` queue. |
| `supabase/functions/robotics-emergency-stop/index.ts` | 122 | Halts fleet nodes, then writes one audit row per node. |
| `supabase/functions/robotics-sim-drainer/index.ts` | 128 | The queue consumer. |
| `supabase/migrations/20281104000000_robot_sim_queue_claim.sql` | 120 | `claimed_at`, `claim_robot_simulation_runs`, `reap_stale_robot_simulation_runs`. |

### Why the claim is an RPC

Claiming is `UPDATE ... WHERE status='queued' ... RETURNING *`. A `select` in the client
followed by an `update` has a race: two concurrent drainers (cron firing while an operator
triggers one by hand) read the same rows and both dispatch them, so one simulation is run
and reported twice. `claim_robot_simulation_runs` does it in one statement with
`FOR UPDATE SKIP LOCKED`, clamps the batch to 1..25, and is executable only by
`service_role`:

```sql
REVOKE ALL ON FUNCTION public.claim_robot_simulation_runs(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_robot_simulation_runs(integer) FROM anon;
REVOKE ALL ON FUNCTION public.claim_robot_simulation_runs(integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_robot_simulation_runs(integer) TO service_role;
```

## 3. The honesty rules this change is built around

Wave 129's defect class was reporting success for work that did not happen. Four explicit
guarantees here, each with a test that fails without it:

| Rule | Test |
|---|---|
| No simulator configured ⇒ **claim nothing**, answer 503 with the queue depth. Marking rows `failed` for a missing env var would destroy queued work to report a configuration gap. | `refuses to claim anything when no simulator is configured` |
| A 2xx with an unreadable body is **not** `completed`. | `marks a run failed when the simulator response is unreadable` |
| A stop request that matched no node reports `stopped: 0`, not a cheerful 200. | `writes no audit rows when nothing matched` |
| Fleet rows are stopped **before** the audit insert, so a partial failure leaves robots stopped rather than moving. | `surfaces an audit failure without undoing the stop` |

## 4. Authentication

`robotics-emergency-stop` and `robotics-sim-drainer` set `verify_jwt = false` in
`supabase/config.toml` because the signed-relay form (`X-Axim-Signature` over the raw body,
no bearer token) is rejected by the platform check before function code runs. That is only
safe because `classifyEdgeCaller` refuses everything anonymous, and the order of its checks
is the security property:

1. A **presented** `X-Axim-Signature` must verify. A bad one is terminal — it never
   downgrades to the bearer check. Otherwise anyone could bypass the HMAC requirement by
   sending a junk signature header alongside a stolen token.
2. `hmac:v2` requires `X-Axim-Timestamp` within a 5 minute window and signs
   `<timestamp>.<body>`; the legacy body-only form is accepted only until its sunset date.
3. Service keys ⇒ `internal`. An unset key never matches, so a missing env var fails closed.
4. A bearer token that resolves to a user ⇒ `user`.
5. Everything else ⇒ `anonymous` ⇒ 401.

`robotics-projects` and `robotics-sim` keep the platform default, so a caller without a
valid JWT never reaches function code at all.

`robotics-sim-drainer` additionally refuses a verified **user** with 403: draining
dispatches to an operator-configured simulator and mutates rows in bulk, so it belongs to
cron or a satellite, not to a dashboard session.

## 5. Second defect fixed: pause/resume never worked

Found while reading `Continued Development Plan.md` §5:

> Reconcile `resumeWorkflow()` with the execution-log schema: it looks for
> `status === 'paused'` (a value the table's CHECK constraint forbids and no writer
> produces) and reads `context` where the row has `execution_context`.

It was worse than that — five breaks on one path:

| # | Break | Where |
|---|---|---|
| 1 | `status` CHECK-constrained to `('completed','failed')`; the engine emits `paused`. | `20281101010000_workflow_definition_and_execution_logs.sql:46` |
| 2 | `logWorkflowExecution()` wrote pauses to `events_ax2024`; `getWorkflowExecutions()` reads `workflow_execution_logs`. The run was never in the table the lookup searched. | `supabaseApiService.js:337` (before) |
| 3 | `normalizeExecutionLogRow()` coerced any non-`failed` status to `completed`, so a stored pause read back as completed. | `supabaseApiService.js:61` (before) |
| 4 | `resumeWorkflow()` read `runData.context`; the normalised field is `execution_context`. Restart context was always `undefined`, so the pending `wait_for_event` paused the run again immediately. | `engine.js:350` (before) |
| 5 | `runWorkflow()` always generated a new `workflowRunId`, so a resume wrote its completion under a fresh id and left the original row `paused` for ever — and `listenForWorkflowEvents()` resumed that row on every subsequent event. | `engine.js:118` (before) |

Changes, all in `src/services/` plus migration `20281104000001`:

- `workflow_execution_logs.status` accepts `'paused'`; adds `paused_at_step`, `paused_at`,
  and a partial index for the resume query. The old CHECK is dropped by **constraint
  discovery**, not by an assumed name — this repo has already lost a day to a migration
  that assumed a constraint or policy name.
- `workflowExecutionLogRow()` (`supabaseApiService.js:101`) — one exported mapping from the
  engine payload to the table row, so the writer cannot drift from the reader again.
- `logWorkflowExecution()` (`:416`) dual-writes. `events_ax2024` stays because four dashboard
  RPCs count `workflows_triggered` from it (`20250101000000_consolidated_schema.sql:396`,
  `:448`; `20270802000001_cache_savings.sql:30`;
  `20271204000000_micro_app_metrics_rpc.sql:55`). The log row is updated by
  `workflow_run_id` and inserted only when no row matched — an upsert is not available
  because the unique index on that column is partial (`WHERE workflow_run_id IS NOT NULL`)
  and PostgREST cannot express that as an `on_conflict` target.
- `normalizeExecutionLogRow()` (`:61`) preserves `paused` and exposes `paused_at_step`.
- `runWorkflow()` (`engine.js:75`) accepts an existing `runId`; `resumeWorkflow()`
  (`:367`) passes it.
- `api.logWorkflowExecution()` (`api.js:173`) forwards `userId`, which the engine had been
  passing and the facade had been dropping.

The two existing pause/resume tests built their fixture with `context`, a field the table
does not have, which is why they passed throughout. They now use `execution_context`.

## 6. Verification

All commands run on the branch tip, 2026-11-04.

### New tests

```
$ NODE_ENV=test npx vitest run tests/robotics-contracts.test.js tests/robotics-caller.test.js --reporter=dot
 ✓ tests/robotics-contracts.test.js  (39 tests) 37ms
 ✓ tests/robotics-caller.test.js  (22 tests) 323ms

 Test Files  2 passed (2)
      Tests  61 passed (61)
   Duration  18.32s
```

```
$ NODE_ENV=test npx vitest run tests/workflow-execution-pause.test.js --reporter=verbose
 ✓ ... > workflowExecutionLogRow > translates the engine payload onto the table columns
 ✓ ... > workflowExecutionLogRow > preserves the paused status and records the step
 ✓ ... > workflowExecutionLogRow > clears the pause fields for a completed run
 ✓ ... > workflowExecutionLogRow > drops a non-UUID actor instead of aborting the insert
 ✓ ... > workflowExecutionLogRow > defaults an unknown status to completed
 ✓ ... > normalizeExecutionLogRow > accepts every status the table allows
 ✓ ... > normalizeExecutionLogRow > does not report a paused run as completed
 ✓ ... > normalizeExecutionLogRow > keeps failed as failed
 ✓ ... > normalizeExecutionLogRow > falls back to completed for an unrecognised status
 ✓ ... > pause -> log -> read -> resume > resumes with the context and step the writer recorded
 ✓ ... > pause -> log -> read -> resume > the resumed run is logged as completed against the same run id
 ✓ ... > pause -> log -> read -> resume > refuses to resume a run that is not paused
 ✓ ... > pause -> log -> read -> resume > refuses to resume a run it cannot find
 ✓ ... > pause -> log -> read -> resume > runWorkflow persists the pause with a step name and the context

 Test Files  1 passed (1)
      Tests  14 passed (14)
```

Note the two lines of stdout in the resume tests:

```
Resuming workflow: approval-wf (Run ID: run-42)
Starting workflow: Approval Workflow (Run ID: run-42)
```

The run id is stable across the resume — that is break #5 fixed.

### Failed-before demonstration (WORKING_AGREEMENT §2)

`git stash push -- src/services/workflows/engine.js src/services/onyxAI/api.js
src/services/supabaseApiService.js`, then the same command:

```
 FAIL  tests/workflow-execution-pause.test.js > workflowExecutionLogRow > translates the engine payload onto the table columns
 FAIL  tests/workflow-execution-pause.test.js > workflowExecutionLogRow > preserves the paused status and records the step
 FAIL  tests/workflow-execution-pause.test.js > workflowExecutionLogRow > clears the pause fields for a completed run
 FAIL  tests/workflow-execution-pause.test.js > workflowExecutionLogRow > drops a non-UUID actor instead of aborting the insert
 FAIL  tests/workflow-execution-pause.test.js > workflowExecutionLogRow > defaults an unknown status to completed
 FAIL  tests/workflow-execution-pause.test.js > normalizeExecutionLogRow > accepts every status the table allows
 FAIL  tests/workflow-execution-pause.test.js > normalizeExecutionLogRow > does not report a paused run as completed
 FAIL  tests/workflow-execution-pause.test.js > pause -> log -> read -> resume > resumes with the context and step the writer recorded
 FAIL  tests/workflow-execution-pause.test.js > pause -> log -> read -> resume > the resumed run is logged as completed against the same run id
 FAIL  tests/workflow-execution-pause.test.js > pause -> log -> read -> resume > refuses to resume a run that is not paused
 FAIL  tests/workflow-execution-pause.test.js > pause -> log -> read -> resume > runWorkflow persists the pause with a step name and the context
 Test Files  1 failed (1)
      Tests  11 failed | 3 passed (14)
```

The three that pass on both trees assert behaviour that is deliberately unchanged:
`'failed'` stays `'failed'`, an unrecognised status falls back to `completed`, and a run
that cannot be found is refused.

The robotics modules did not exist on `origin/main` at all, so every test in
`tests/robotics-*.test.js` is red there by construction.

### Pre-existing pause/resume tests, after the fixture correction

```
$ NODE_ENV=test npx vitest run src/services/workflows/__tests__/workflow.test.js src/services/__tests__/workflows.test.js --reporter=dot
 ✓ src/services/__tests__/workflows.test.js  (2 tests) 8477ms
 ✓ src/services/workflows/__tests__/workflow.test.js  (1 test) 82ms

 Test Files  2 passed (2)
      Tests  3 passed (3)
```

### Gates

```
$ node scripts/check-edge-syntax.mjs
Edge syntax OK: parsed 103 Deno source(s) under supabase/functions.
```

(the count is 97 before this change; the delta is the four new functions plus the two
shared modules)

```
$ npm run check:creds
check:creds — no literal credential fallbacks in server or client code.
```

```
$ npx eslint .
EXIT:0
```

```
$ cd cloudflare-workers && npx esbuild src/index.js --bundle --format=esm
  ../../../../tmp/worker-bundle.js  11.2kb
⚡ Done in 89ms
```

```
$ cd cloudflare-workers && npx wrangler deploy --dry-run -c wrangler.toml
Total Upload: 32.79 KiB / gzip: 8.09 KiB
env.SUPABASE_URL ("https://pvbcdndqjguzqeafhwhw.supabase...")  Environment Variable
env.ALLOWED_ORIGINS ("https://axim.us.com,http://localhost:...")  Environment Variable
--dry-run: exiting now.
```

```
$ npm run build
✓ built in 9m 18s
```

Full suite: recorded in PR #497's description once the run completed; see §7 for the
reading.

## 7. Not verified here, and why

- **The two migrations have not been executed.** WORKING_AGREEMENT §3: "a migration that
  has not been executed is not verified." There is no `SUPABASE_ACCESS_TOKEN` in this
  environment, so `supabase db push --dry-run` cannot run. Both files are written to be
  idempotent (`ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `CREATE OR REPLACE
  FUNCTION`, constraint dropped by discovery). `Supabase Preview` in CI applies them to a
  preview branch on the PR, which is the first real execution.
- **`robotics-sim-drainer` has never dispatched to a real simulator.** `ROBOTICS_SIM_ENDPOINT`
  does not exist yet; the drainer's designed answer in that state is 503 with the queue
  depth, which is what the `refuses to claim anything when no simulator is configured`
  test pins. Wiring the endpoint is an operator step, not a code step.
- **The `deno` binary is not installed**, so the three `_test.ts` Deno suites still do not
  run anywhere. Unchanged from the Wave 127 appendix §6.
- **Nothing is deployed.** Merging does not deploy: Core has no deploy workflow on push.
  The migrations need `supabase db push` and the functions `supabase functions deploy`
  (the `Deploy to Supabase` reusable workflow runs `supabase functions deploy` with no
  name filter, so all four are picked up).

## 8. Operator follow-up

1. Apply migrations `20281104000000` and `20281104000001`.
2. `supabase functions deploy robotics-projects robotics-sim robotics-emergency-stop robotics-sim-drainer`.
3. Set `ROBOTICS_SIM_ENDPOINT` (and optionally `ROBOTICS_SIM_TIMEOUT_MS`).
4. Schedule `POST /functions/v1/robotics-sim-drainer` from `pg_cron` with the service-role
   bearer, and `reap_stale_robot_simulation_runs(1800)` on the same cadence.
5. Create the first `robot_projects` row — `robotics-sim` answers 404 for an unknown
   project id by design.

---

## 9. Follow-on: the route-table guard the drift needed

The reason all three robotics routes could answer 404 for as long as the schema has existed
is that nothing related the worker's `apiRoutes` map to the function directories. That gap
is now closed:

- `cloudflare-workers/src/index.js` exports `apiRoutes` (it was module-private).
- `tests/edge-routes.test.js` (5 tests) imports the **real** map and asserts every
  `/functions/v1/<name>` target has a `supabase/functions/<name>/index.ts`.

Functions that are routed to but not yet built are named in a `NOT_YET_BUILT` allowlist
(`mcp-router`, `mcp-sse`, `mcp-message`), and a second test asserts the allowlist is still
accurate — so building one of them forces its removal instead of leaving a permanent excuse.
A third asserts the robotics functions are *top-level* directories, because
`supabase functions deploy` with no name filter only picks up top-level directories and a
nested helper would never ship.

```
$ NODE_ENV=test npx vitest run tests/edge-routes.test.js --reporter=verbose
 ✓ ... > has routes to check
 ✓ ... > every route target is a known function or a recorded gap
 ✓ ... > the recorded gaps are still gaps
 ✓ ... > routes the robotics API at functions that exist
 ✓ ... > the function directories it points at are in the deployable tree

 Test Files  1 passed (1)
      Tests  5 passed (5)
```

**Detection demonstrated**, not assumed. A bogus route was injected
(`['/api/v1/drift-probe', '/functions/v1/does-not-exist']`), the suite re-run, the route
reverted:

```
 FAIL  tests/edge-routes.test.js > edge worker route table > every route target is a known function or a recorded gap
 /api/v1/drift-probe -> does-not-exist (no supabase/functions/does-not-exist/index.ts)
 Tests  1 failed | 4 passed (5)
```

`apiRoutes` is imported rather than re-parsed out of the source, so a rename fails the test
instead of silently yielding an empty map that passes vacuously.

## 10. What the type checker could and could not say

`deno check` is not available in this environment (no `deno` binary), so the typed surface
was probed with `tsc --strict` instead, over `_shared/robotics.ts` and `_shared/edgeCaller.ts`:

```
$ npx tsc --noEmit --target es2022 --module esnext --moduleResolution bundler \
    --allowImportingTsExtensions --skipLibCheck --strict --lib es2022,dom \
    supabase/functions/_shared/robotics.ts supabase/functions/_shared/edgeCaller.ts
TSC_EXIT:0
```

The four `index.ts` entrypoints cannot be checked this way: they import
`https://deno.land/std/...` and `https://esm.sh/...` and reference the `Deno` global, none of
which Node's `tsc` resolves. That is not specific to the new code — the already-deployed
`system-status/index.ts` produces the same `TS2307`/`TS2304`/`TS7006` profile:

```
$ npx tsc -p <same options, plus supabase/functions/system-status/index.ts>
supabase/functions/system-status/index.ts(1,23): error TS2307: Cannot find module 'https://deno.land/std@0.168.0/http/server.ts' ...
supabase/functions/system-status/index.ts(16,25): error TS2304: Cannot find name 'Deno'.
supabase/functions/system-status/index.ts(33,28): error TS7006: Parameter 'item' implicitly has an 'any' type.
```

Every error raised for the new entrypoints is of those three classes. `npm run check:edge`
(esbuild parse of all 103 Deno sources) remains the executed gate, and installing Deno in CI
is still the open item from the Wave 127 appendix §6.

## 11. Full suite

```
$ NODE_ENV=test npx vitest run --reporter=dot --maxWorkers=2
 ✓ tests/robotics-caller.test.js  (22 tests) 720ms
 ✓ tests/robotics-contracts.test.js  (39 tests) 2557ms
 ✓ tests/workflow-execution-pause.test.js  (14 tests) 322ms
 ...
 Test Files  105 passed | 2 skipped (107)
      Tests  723 passed | 9 skipped (732)
   Duration  2346.56s
EXIT:0
```

Baseline on `origin/main` (`6669ad3`, the Wave 129 appendix) was 102 files / 648 tests.
This change adds 80 tests across four files.

`tests/edge-routes.test.js` was written after this run started, so vitest never collected it;
it was run on its own (§9) and again on the branch tip. The two skipped files
(`EcosystemRegistry.test.jsx`, `onyxAI/commands/__tests__/workflow.test.js`) are
pre-existing skips.

## 12. CI on PR #497

| Check | Result |
|---|---|
| `smoke-test` (`check:creds`, `check:edge`, smoke tests, `npm run build`, worker dry-run) | ✅ pass, 1m44s |
| Reusable Security Audit (`security-scan`) | ✅ pass, 1m33s |
| **Supabase Preview** | ✅ pass, 47s — **this executed both migrations** against preview project `xkaececdqavmclswanqo`, which is the first real execution and clears the WORKING_AGREEMENT §3 requirement |
| Cloudflare Pages | ✅ pass |
| GitGuardian Security Checks | ✅ pass |
| **Workers Builds: axim-core-worker** | ❌ failure — **production-only, environmental** |

The worker-build failure is not a signal about this change. It fails on every non-`main`
push in this repository and passes on every `main` push; see the Wave 128 appendix §8 and
WORKING_AGREEMENT §4. Same check, same failure, on all five unrelated Dependabot PRs open
at the same time (#482, #485–#488), which is the comparison §4 asks for.

## 13. Dependabot queue — assessed, deliberately not merged

Five Dependabot PRs are open and green except the environmental worker check, and the
repository carries 169 advisories on the default branch (11 critical, 60 high) according to
GitHub. They were **not** merged in this wave, on purpose:

- `glob` 13.0.6 → 14.0.3 and `electron` 41.10.7 → 42.11.16 are **major** bumps. Merging
  them on a red-except-known-false signal would be the "merge on everything except one
  check" pattern WORKING_AGREEMENT §4 warns about, and neither has been through
  `npm run build` or the suite here.
- The three patch/minor bumps (`follow-redirects` 1.16.0 → 1.16.2, `fast-uri` 3.1.7 →
  3.1.9, `undici` 6.28.1 → 6.29.1) are low risk but each arrives as its own branch, so
  landing them means three more full build+suite cycles.

Recommendation: one dedicated dependency PR that bumps the whole lockfile at once, run
through `npm run build`, the full suite and the worker dry-run, with a recorded before/after
`npm audit` count. Five independent merges would each need that proof and would produce
neither a coherent lockfile nor a reviewable diff.
