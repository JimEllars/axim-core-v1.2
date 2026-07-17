## Wave 63 Changelog
### Implemented Features
- **Gnosis Safe Multi-Sig Integration:** Abstracted token dispatch logic from standard proxy wrappers into the @safe-global/protocol-kit framework, enforcing smart contract level approval models on Layer-2.
- **Cloudflare AI Gateway Metric Surface:** Pushed RPC changes to aggregate edge proxy telemetry logs, calculating dynamic token savings and displaying the metric in the Management Cockpit UI.

### Wave 66 Upgrade: Live Ingress Telemetry Piping, Onyx Cross-Platform Bridge Activation, and Zero-Trust Guard Calibration

#### Verification Appendix
**Files Added/Modified:**
- `supabase/functions/telemetry-ingress/index.ts` (Modified lines to import and apply `sanitizePayload`, changed insert target to `events_ax2024`)
- `src/hooks/useMetrics.js` (Modified to compute `ecosystemAlarmProcessingVelocity` by fetching and filtering `support_tickets`)
- `supabase/functions/onyx-bridge/index.ts` (Modified to intercept `sync_desktop_state` action and bind inbound streaming to `hitl_audit_logs`)
- `src/components/tickets/OnyxInvestigationPanel.jsx` (Added realtime subscription to `hitl_audit_logs` for `desktop_sync` events, and UI block to render `desktopStream`)
- `supabase/functions/universal-dispatcher/index.ts` (Added empty parsing properties for `lab_code_generation` and `lab_engine_closeout` actions to prepare for Lab code generation engines)

**Tests Added/Modified:**
- `src/services/__tests__/telemetry.test.js` (Created to test `telemetry-ingress` loop bypassing human latency)
- `src/services/__tests__/apiProxy.test.js` (Created to verify `submitMicroAppTelemetry` cleanly rejects invalid structural shapes)
- `tests/ui-smoke.test.jsx` (Modified to confirm that simulated edge timeout anomalies freeze dashboard card components safely inside `min-h-[160px]` loading geometries)
