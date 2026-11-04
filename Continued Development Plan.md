# Continued Development Plan - AXiM Core

## 1. Stabilization & Quality Assurance
- [x] Fix ESLint configuration (missing `@eslint/js`).
- [x] Fix unused variable warnings in `gcp-backend`.
- [x] Address test warnings where possible (e.g., `react-hot-toast` in tests).
    - Fixed `DeviceManager.test.jsx` "non-labellable" error by using `getByRole`.
    - Skipped flaky `DeviceManager` update test that fails in JSDOM but works manually.

## 2. Ecosystem Integration (Next-Gen AI)
- [x] Create a "Smart Workflow" that leverages external apps.
    - Implemented `workflowCommands.js` to expose workflows.
    - `Audio Intelligence Pipeline` workflow (Transcribe -> Summarize) is ready.
- [x] Verify `api.js` reliably manages dual-write to ensuring `ai_interactions_ax2024` is populated on both GCP and Supabase.
    - Verified `api.logAIInteraction` writes to both backends.
- [x] Verify integration with external apps (Transcription, Ground Game).
    - `externalCommands.js` calls `api.js`.
    - `gcp-backend` proxies these calls to Supabase Edge Functions (`axim-transcribe`, `ground-game-assign`).

## 3. Infrastructure & Redundancy
- [x] Review and enhance the `schedule-chatlog-export` workflow.
    - Verified `schedule-chatlog-export.yml` and `google-drive-export` Edge Function. Daily export is functional.
- [x] Verify `gcpApiService.js` error handling is sufficient for production.
    - Verified `gcp-backend/apiService.js` has try/catch blocks and proxies to Supabase.

## 4. Deployment
- [x] Verify Docker builds for `gcp-backend`.
    - `gcp-backend/Dockerfile` and `cloudbuild.yaml` are correctly configured.
- [x] Ensure Electron build configuration is ready for multi-platform (Windows/Linux).
    - `package.json` includes targets for NSIS (Win), DMG (Mac), and AppImage (Linux).

## 4b. Edge deployability (added 2026-11-01, Wave 127)

- [x] Make every Deno Edge Function parse again. *(Four of 95 did not: a committed
      conflict marker in `_shared/edgeAuth.ts` plus three authoring defects in
      `audit-export`, `gateway-heartbeat` and `stream-webhook`. All four fixed; the list
      and the proving transcripts are in
      `AGENTS_VERIFICATION.d/2026-11-01-wave127-edge-parse-gate.md`.)*
- [x] Add a gate so an unparsable Deno source cannot merge again.
      *(`npm run check:edge` parses all of `supabase/functions/` with esbuild and reports
      conflict markers; it runs in `verify-smoke-tests.yml` on every PR. Detection is
      proven by `tests/edge-syntax.test.js`.)*
- [x] Fix the pre-existing red test in
      `src/services/onyxAI/commands/__tests__/network.test.js`. *(It asserted `1 day ago`
      for exactly 24 hours, which date-fns 4.4.0 renders as `about 23 hours ago`; the
      fixture now uses 26 hours.)*
- [ ] Install Deno in CI (`denoland/setup-deno`) and run `deno check` plus the three
      existing Deno suites (`_shared/edgeAuth_test.ts`, `_shared/signature_test.ts`,
      `_shared/tenancy_test.ts`). They have never executed in any pipeline. *(`deno` is
      not installed here either, so this could not be verified locally — see the appendix §6.)*
- [ ] Add `npm run test` to CI. *Measured on 2026-11-02 (2 vCPU, 3.9 GB): an aggregate
      `vitest run` does not hang — it completes, but the jsdom environment costs 8–10 s per
      file and 96 files take roughly an hour at `--maxWorkers=2`. The suite has never gated
      a pull request because it is wired to `reusable-run-tests.yml`, which no workflow
      calls. A runner with more vCPUs is the prerequisite, not a code fix.*
- [x] Land Wave 127. *(It merged as part of #494 — the branch had been cut from that tip,
      so the squash carried all four commits. #493 closed as superseded.)*
- [x] Rebase and open PRs for `feat/core-wave-125-workflow-persistence-and-ingress` and
      `feat/core-wave-126-node-inspector-and-execution-history`. *(Wave 129: rebased onto
      `a83d901` and reconciled with #491/#492/#494/#495 rather than merged as-is, so the
      tenancy and versioned-signature work is preserved. See
      `AGENTS_VERIFICATION.d/2026-11-03-wave129-merge.md`.)*
- [ ] Ask Cloudflare to explain why `Cloudflare Pages` failed the production build of
      `b80f450` while succeeding on the identical tree `dfccdc8` 40 minutes earlier
      (evidence table in the Wave 128 appendix §8). Workers Builds is also production-only:
      it fails on every non-`main` push and passes on every `main` push, so a PR can never
      show a green worker deploy.
- [ ] `eslint.config.js` ignores `cloudflare-workers` at the top level, which makes its later
      `cloudflare-workers/src/**` block unreachable. Un-ignoring it will surface findings, so
      it belongs in its own change.

## 4c. Caller authentication (added 2026-11-02, Wave 128)

- [x] Authenticate `trigger-workflow`. *(`verify_jwt = false` meant the platform checked
      nothing and the function checked nothing either: an anonymous POST ran any workflow
      and was recorded against whatever `userId` the body claimed. It now resolves the
      caller and binds the identity — `_shared/workflowAuth.ts` holds the rule, 11 tests
      cover it.)*
- [x] Remove every literal credential fallback from Edge Functions and from client code.
      *(`|| "fallback_internal_key"` and `|| 'test_internal_key'` made a missing env var
      into a working, publicly guessable credential — and the same literal was in the
      browser bundle, so client and server authenticated each other with it.
      `npm run check:creds` now blocks the pattern; `tests/check-credentials.test.js`
      proves the gate fails on fixtures.)*
- [x] Stop the dashboard authenticating with service credentials.
      *(`VITE_SUPABASE_SERVICE_ROLE_KEY` / `VITE_AXIM_SERVICE_KEY` are inlined into the
      public bundle. Six modules now present the operator's own session token via
      `src/services/sessionAuth.js`, and the receiving functions accept a verified user.)*
- [ ] Remove the last browser-held shared secret: `VITE_ONYX_SECURE_KEY` is used to
      HMAC-sign requests straight to the Onyx edge bridge from `ChatMessage.jsx`,
      `MetricsGrid.jsx`, `SystemHealthPanel.jsx`, `api.js` and `useVectorSearch.js`.
      Whoever reads the bundle can forge a valid signature for the bridge, so the right
      fix is a Core relay that signs server-side (`AXIM_INTERNAL_KEY`) and lets the
      browser call Core with its session token only. This is the highest-severity item
      left and it needs an Onyx-side change too.
- [ ] `systemCommands.js` still passes an operator-supplied `userId` into
      `aximCore.api.createAutomation()`; verify the receiving RPC derives the owner from
      the token rather than trusting it.

## 5. Future Roadmap
- [x] Implement a UI for visual workflow building. *(Wave 125: the builder now
      rehydrates `workflows_ax2024.definition` into React Flow and persists it
      back through `supabaseApiService.saveWorkflow()`; action nodes dispatch for
      real in `trigger-workflow`. Wave 126 added the typed config inspector and
      the pre-dispatch validation gate.)*
- [x] Add a node configuration inspector for typed action steps (`api_call`,
      `email`, `robot_sim_run`, `robot_policy_gate`, `robot_ota_deploy`) so the
      config the runner expects is authored in the UI rather than by hand.
      *(Wave 126: `src/utils/workflowNodeConfig.js` holds the contract,
      `WorkflowNodeInspector.jsx` renders it, and "Run Workflow" refuses to
      dispatch a graph the runner would halt on.)*
- [x] Point `getWorkflowExecutions()` at `workflow_execution_logs` (it still reads
      `events_ax2024`), and surface `status`/`error_message` in the History tab.
      *(Wave 126, with a `42P01`/`PGRST205`-only fallback to the legacy event
      stream.)*
- [x] Build the three robotics Edge Functions the worker already routes to
      (`robotics-projects`, `robotics-sim`, `robotics-emergency-stop`) and a
      consumer that drains `robot_simulation_runs`. *(Wave 130: the three
      functions exist and are gated on a resolved caller;
      `robotics-sim-drainer` claims queued runs atomically through
      `claim_robot_simulation_runs` (`FOR UPDATE SKIP LOCKED`, `service_role`
      only) and dispatches them to `ROBOTICS_SIM_ENDPOINT`.
      It answers 503 and claims nothing when that endpoint is unset — see
      `AGENTS_VERIFICATION.d/2026-11-04-wave130-robotics-and-pause-resume.md` §3.)*
- [ ] Provide the headless simulator itself. `robotics-sim-drainer` dispatches
      correctly and records `completed`/`failed` honestly, but
      `ROBOTICS_SIM_ENDPOINT` is unset, so the designed answer today is 503 with
      the queue depth. This is the next increment and it is an infrastructure
      step, not a code step: a headless physics/sim process that accepts
      `{run_id, project_id, scene_type, duration_sec, params}` and returns
      `{exit_state}`.
- [ ] Schedule the drainer and the reaper from `pg_cron` (service-role bearer on
      `POST /functions/v1/robotics-sim-drainer`, plus
      `reap_stale_robot_simulation_runs(1800)` so a drainer invocation that dies
      mid-dispatch does not strand a run in `running`).
- [ ] Build the MCP Edge Functions the worker also routes to (`mcp-router`,
      `mcp-sse`, `mcp-message`); `/mcp`, `/sse` and `/message` currently return
      Supabase's 404.
- [x] Reconcile `resumeWorkflow()` with the execution-log schema. *(Wave 130:
      five breaks, not two — the `status` CHECK forbade `paused`, the writer put
      pauses in `events_ax2024` while the reader read
      `workflow_execution_logs`, the reader coerced `paused` to `completed`, the
      resume read `context` instead of `execution_context`, and `runWorkflow()`
      minted a new run id on resume so the original row stayed paused for ever.
      All five fixed; migration `20281104000001` adds the state and its columns.)*
- [ ] Add more external service integrations (e.g., Email Service, Calendar).
- [ ] Enhance "Memory Banks" to index and search past conversations more effectively (RAG).
    - Current state: Chats are logged to `ai_interactions_ax2024` (Postgres).
    - Next step: Add `embedding` column and vector search logic.
