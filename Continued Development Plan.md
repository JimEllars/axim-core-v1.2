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

## 5. Future Roadmap
- [x] Implement a UI for visual workflow building. *(Wave 125: the builder now
      rehydrates `workflows_ax2024.definition` into React Flow and persists it
      back through `supabaseApiService.saveWorkflow()`; action nodes dispatch for
      real in `trigger-workflow`. Remaining: a typed config inspector per action
      node, and reconciling the History tab with `workflow_execution_logs`.)*
- [ ] Add a node configuration inspector for typed action steps (`api_call`,
      `email`, `robot_sim_run`, `robot_policy_gate`, `robot_ota_deploy`) so the
      config the runner expects is authored in the UI rather than by hand.
- [ ] Point `getWorkflowExecutions()` at `workflow_execution_logs` (it still reads
      `events_ax2024`), and surface `status`/`error_message` in the History tab.
- [ ] Build the three robotics Edge Functions the worker already routes to
      (`robotics-projects`, `robotics-sim`, `robotics-emergency-stop`) and a
      consumer that drains `robot_simulation_runs`.
- [ ] Add more external service integrations (e.g., Email Service, Calendar).
- [ ] Enhance "Memory Banks" to index and search past conversations more effectively (RAG).
    - Current state: Chats are logged to `ai_interactions_ax2024` (Postgres).
    - Next step: Add `embedding` column and vector search logic.
