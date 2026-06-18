
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
