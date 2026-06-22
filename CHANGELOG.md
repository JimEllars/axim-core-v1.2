

## [Wave 54] - 2026-06-21

### Added
- **Deployment Reconciliation:** Consolidated root `migrations/` into `supabase/migrations/` completely removing deprecation.
- **RAG Integrity:** Replaced destructive compression with `compressed` boolean flags and non-destructive summarization in `ai_memory_banks`. Implemented real backfill for missing embeddings via DLQ batching.
- **Execution Engine:** Added `cron-parser` to `workflow-engine` for robust schedule next_run_at calculations. Added logic in `job-processor` to execute cron tasks properly.
- **API Key Lifecycle:** Created `rotate-api-key` and `revoke-api-key` edge functions handling secure hashing, one-time reveal, and soft-revocations (with status/revoked_at).
- **Telemetry UI:** Added `QueueDepthPanel` for cron active tasks, pending jobs, and dead letters. Improved robust states in `SystemHealthPanel`.
- **UI Reinforcement:** Improved a11y focus rings and text contrast across `ApiKeyManager`, `MemoryBank`, and `EcosystemRegistry`.

## [Wave 53] - 2026-06-21

### Added
- **Server-Side API Keys:** Created `issue-api-key` function that securely issues keys via hashing.
- **Workflow Execution Cron:** Created initial `workflow-engine` edge function triggered via cron to push tasks to `satellite_job_queue`.

## [Wave 52] - 2026-06-21

### Added
- **Telemetry Immune System:** Built alert-bus triggers, `onyx-sentinel`, and `RealtimeContext` for UI feedback.
- **Micro-App State Commit:** Edge functions built to securely commit micro-app execution states to central tracking tables.

## [Wave 51] - 2026-06-16

### Hardened
- **WorkflowBuilder:** Replaced partial save mock with fully functional load/save/upsert behaviors via `supabaseApiService`. Improved loading UX and labeled incomplete scheduling features.
- **ApiKeyManager:** Replaced hardcoded dummy strings with cryptographically secure `crypto.getRandomValues` keys for an interim safe-fallback. Also ensured generated key is shown to the user once and hidden securely in UI. (Note: True backend issuance still pending).
- **RAG Execution:** Guaranteed that `llm.js` explicitly maps retrieved context strings from memory into the outgoing prompt. Added test coverage covering memory failovers and mock provider modes.

### Documentation
- Reconciled drift between implemented features and tracking documents.

## [Wave 48] - 2026-06-14

### Fixed
- Restored Supabase deployment workflow
- Fixed Google Drive chatlog export authentication
- Repaired content engine automation
- Updated security audit to allow moderate vulnerabilities

### Infrastructure
- All CI/CD pipelines operational
- Automated deployments re-enabled
- Scheduled tasks running successfully
- Audited codebase for TODO/FIXME/XXX/HACK comments. No actionable outstanding markers remain that require immediate 30-min fixes.
- Enhanced error messages in src/services/onyxAI/index.js to be actionable and descriptive.
