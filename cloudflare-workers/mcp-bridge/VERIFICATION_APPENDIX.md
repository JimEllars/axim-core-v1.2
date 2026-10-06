## Verification Appendix (Proof-of-Fix Protocol)

1. **The Target File & Line Range:** `cloudflare-workers/mcp-bridge/src/index.js` (Lines 1-352) & `cloudflare-workers/mcp-bridge/src/auth.ts` (Lines 1-46).
2. **The Exact Change:**
   Replaced previous insecure double-auth in `src/index.js`:
   ```javascript
   // Old auth logic
   const authHeader = request.headers.get('Authorization') || '';
   const token = authHeader.replace(/^Bearer\s+/i, '') || request.headers.get('X-Axim-Gateway-Token');
   ```
   With the two-tier CF Access and Passport SSO Operator validation:
   ```javascript
   // New auth.ts check
   const authResponse = await authenticateOperator(request, env);
   if (authResponse) return authResponse;
   ```
   Implemented kill switch, rate limit, egress scrubber (`sanitizeEgressPayload`), and internal MCP tool set (`bridge_runtime_status`, `bridge_security_check`, `core_health_check`, `telemetry_lookup`, `hitl_queue_status`, `axim_list_nodes`, `axim_get_telemetry`, `axim_dispatch_task`).
3. **The Proving Test:** `accepts authorized operator requests (james.ellars@axim.us.com)` in `tests/mcp-bridge.test.js` passes now verifying successful end-to-end integration of the auth layer and payload. Redaction tests also pass: `verifies that sanitizeEgressPayload redacts secrets from live telemetry output`.
