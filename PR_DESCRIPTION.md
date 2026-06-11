# AXiM Core: System Activation Wave Update

## Workstreams Addressed
**A — Repo Hygiene:**
- Removed runtime artifacts (`dev_server.log`, `frontend.pid`, `precommit_check.txt`, `test_migration.sql`) and added corresponding rules to `.gitignore`.

**B — System Activation Registry & Status Surfacing:**
- Created `system-status` Edge Function which returns an aggregation of node and app health.
- Refined the `system-status` endpoint to use an authenticated Supabase client for tenant scoping via RLS rather than relying on the service role key.
- Updated the Cloudflare worker (`cloudflare-workers/src/index.js`) to proxy this endpoint and cache it with `max-age=15` (short TTL) for freshness.
- Updated `Sidebar.jsx` to dynamically monitor status, active processes, and online nodes. Designed a fail-soft strategy that displays "STATUS UNKNOWN" gracefully if the backend is unreachable without blocking UI interaction.

**C — Workflow Engine:**
- Implemented `query_database` step in `src/services/workflows/engine.js` using parameterized `supabase` client methods to prevent SQL injection and ensure tenant-scoping via RLS.
- Completed the wait_for_event pause/resume logic ensuring idempotency. When an awaited event is received, `resumeWorkflow` will correctly skip previously completed steps to prevent re-execution and continue the workflow seamlessly. Tests were added to verify workflow resumption behavior.

**D — RAG / Memory:**
- Activated auto-RAG loop inside `src/services/onyxAI/llm.js`. When the option `skipRAG` is omitted and the prompt is relatively short, it performs a vector lookup using `match_memory_banks` scoped to the current user's ID. It gracefully degrades (continuing with the standard prompt) if embedding generation or RAG lookup fails. Added `skipRAG` in corresponding tests to prevent extra calls.

**E — Edge Function Deployment & Secrets Verification:**
- Generated a full Deployment Manifest (`supabase/functions/DEPLOYMENT.md`) referencing all edge functions, necessary vault secrets, and corresponding Cron jobs. Flagged functions pointing to missing or undocumented required secrets.
- Provided a `scripts/smoke-test-functions.js` utility connected to `npm run test:functions` to verify function health efficiently in CI/local runs. It will safely skip testing functions that lack required secrets in the environment.

**F — Onyx Bridge:**
- Added test coverage confirming the proper behavior and fallback pathways of the `sendToOnyxWorker` endpoint inside `src/services/onyxAI/__tests__/api.test.js`.

All pre-commit validations (lint & test) passed successfully.
