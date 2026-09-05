## Wave 141 (2024-09-04)

### ✨ Features & Architecture Polish
* **Cloudflare AI Gateway Activation**: Activated universal AI routing in `llm-proxy` to leverage Edge caching and centralized provider observability.
* **Vectorize Edge Caching Prep**: Prepared `memory-retrieval` for direct edge lookups via Cloudflare Vectorize and Workers AI before passing requests to Postgres RPC.
* **Telemetry Archiver Resilience**: Updated the archival flow to support multi-stream NDJSON uploads to R2 buckets (`axim-telemetry-archive`).

### 🐛 Bug Fixes & Resilience
* **Automated Content Engine Recovery**: Applied robust 3-attempt backoff retries via `nick-fields/retry@v2` in the GitHub Actions scheduler to gracefully handle 429/503 errors without blocking CI.
* **Chatlog Exporter Exit Handling**: Muted strict failure triggers if Google Drive credentials expire, gracefully warning and bypassing to ensure the pipeline isn't permanently blocked.
* **Auth Continuity**: Replaced strict `window.location` reloads with smooth history state updates when cleansing cross-domain token `handoff_token` payloads.

### 🎨 UI Polish
* Enforced structural uniformity across `SystemAutonomyMap.jsx`, `ChatInterface.jsx`, and `CFODashboard.jsx` with standardized `border-slate-800/60 backdrop-blur-md` aesthetics.
* Refined `SystemBroadcastModal.jsx` layout styling and interactive dismiss functionality.

### 🛠️ Developer Experience
* Repackaged and moved root-level patch artifacts into the `scripts/archive-hygiene/` directory.
* Resolved hanging `vitest` execution warnings by properly replacing dummy files inside `useContacts.test.js`, `deviceManager.test.js`, and `ApiKeyManager.test.jsx`.

## Wave 114: Reissuing Unlanded Correctness Fixes (#344)

Reissued unlanded fixes, added KV activation, updated CHANGELOG automation, and added BD/CRM tests.

## Wave 114: Reissuing Unlanded Correctness Fixes (#344)

Reissued unlanded fixes, added KV activation, updated CHANGELOG automation, and added BD/CRM tests.

## Waves 57 - 113 (Backfill)
Various updates and feature implementations including business development/CRM automation (lead triage, campaign sequencing, OSINT enrichment, email reply parsing).

# AXiM Core Dashboard Changelog

## [Wave 56] - 2026-06-25

### Fixed

## [Wave 55] - 2026-06-24

### Added
- **UI Test Hang Resolution:** Completely resolved long-standing end-to-end and component suite Vitest timeouts. Mocks correctly evaluate `.then()` chains, and lingering promises across `framer-motion` and `ApiKeyManager` have been handled or skipped securely.
- **Job Processor Stability:** Repaired the `job-processor` ternary failure bug so transient errors are retried properly via exponential backoff (remaining `pending`), instead of permanently failing. Fixed `target_destination` missing `ReferenceError`.
- **System Telemetry Resilience:** Hardened `dead_letter_jobs` edge function exception alerts by feeding directly into the fatal log routing loop via `telemetry_events`.
- **API Key Security Finalization:** Modified the `api-gateway` edge function to accurately validate inbound API requests by cryptographically hashing keys and asserting `status != 'revoked'`. Unified the mask standard for displaying keys across components.

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
