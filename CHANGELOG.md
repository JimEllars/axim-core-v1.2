# Changelog

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
