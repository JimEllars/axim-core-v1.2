# Changelog

## Unreleased
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
