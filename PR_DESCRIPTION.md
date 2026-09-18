## DeepSeek Primary / Anthropic Failover Integration & System Hardening

This pull request implements the requested architectural shift to prioritize DeepSeek for primary LLM generation with an automated fallback to Anthropic. It also hardens the MCP Bridge authentication and finalizes the Passport SSO protocol for the AXiM ecosystem.

### Verification Appendix

1. **Target File & Line Range:** `supabase/functions/llm-proxy/index.ts:182-261`
2. **Exact Change Snippet:**
```typescript
    // Dispatch to DeepSeek directly
    let response;
    let respondingProvider = 'deepseek';
    let failedOver = false;

    const deepseekBaseUrl = Deno.env.get('DEEPSEEK_BASE_URL') || 'https://api.deepseek.com/v1';

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 15000);

    const startTime = Date.now();
    let directUrl = `${deepseekBaseUrl}/chat/completions`;

    try {
        console.log(`[${request_id}] Dispatching to DeepSeek (${directUrl})...`);
        response = await fetch(directUrl, {
            method: 'POST',
            // ...
```
3. **Proving Test:** `tests/llm-proxy.test.js` contains the test verifying this function, which passes successfully after updates.

### Summary of Changes

- **llm-proxy updates:** DeepSeek API direct execution integration implemented. A catch block captures `AbortError`, `429`, and `5xx` errors to fallback to Anthropic using `claude-3-5-sonnet-20241022` seamlessly. The SSE format transformation matches Anthropic's output to OpenAI's protocol.
- **Provider Management:** `ProviderManager` and `ProviderSelector` components updated to show DeepSeek as primary default and Anthropic as backup.
- **MCP Bridge Auth Hardening:** Configured `cloudflare-workers/mcp-bridge/src/index.js` to assert `X-Axim-Gateway-Token` and explicitly define supported JSON-RPC routes: `axim_ping`, `core_health_check`, `telemetry_lookup`, `workflow_dispatch`, and `hitl_queue_status`.
- **Passport SSO Handoff Integration:** The AXiM session generation workflow in `AuthContext` now fetches and validates against `passport.axim.us.com/api/v1/auth/verify-token`, verifying `jrellars@gmail.com` and `james.ellars@axim.us.com` into a dedicated `super_user` role map.
