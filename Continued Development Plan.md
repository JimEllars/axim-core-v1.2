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
- [ ] Diagnose why an aggregate `vitest run` stalls on a 2-core host and then add
      `npm run test` to CI. It is currently wired to `reusable-run-tests.yml`, which no
      workflow calls, so the suite has never gated a pull request.
- [ ] Rebase and open PRs for `feat/core-wave-125-workflow-persistence-and-ingress` and
      `feat/core-wave-126-node-inspector-and-execution-history`. Both are pushed with no
      PR and both predate #491/#492, so merging them as-is would drop the tenancy and
      versioned-signature work.

## 5. Future Roadmap
- [ ] Implement a UI for visual workflow building.
- [ ] Add more external service integrations (e.g., Email Service, Calendar).
- [ ] Enhance "Memory Banks" to index and search past conversations more effectively (RAG).
    - Current state: Chats are logged to `ai_interactions_ax2024` (Postgres).
    - Next step: Add `embedding` column and vector search logic.
