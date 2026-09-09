# Changelog

## Unreleased
- Hardened Cloudflare Edge Telemetry & Backpressure Buffer with KV fallback and backoff jitter.
- Updated `telemetry.js` to ensure array sizing and local memory ring buffering limits.
- Improved AuthContext with silent token renewal to prevent state flickers.
- Fixed overlapping events in `PassportListener.jsx` and added strict lifecycle rules.
- Upgraded `CloudflareEdgeHealth` and `QueueDepthPanel` UI to align with enterprise design tokens and error boundary logic.
- Fallback timeout configurations provided for AI Providers.
