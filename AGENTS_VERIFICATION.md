# Verification Appendix (Proof-of-Fix Protocol)

1. **Target File & Line Range:** `supabase/functions/llm-proxy/index.ts:79-114`
**The Exact Change:**
```typescript
    let { provider, prompt, options = {} } = await req.json();
    if (!provider || provider.trim() === '') {
        provider = 'deepseek';
    }
```
**The Proving Test:** `invokes edge proxy layer without an explicit model parameter resolves natively to deepseek-chat compute path` in `tests/api-gateway.test.js`

2. **Target File & Line Range:** `cloudflare-workers/onyx-edge-worker/src/index.ts:18-50`
**The Exact Change:**
```typescript
    try {
        const aiResponse = await env.AI.run("@cf/baai/bge-base-en-v1.5", {
            text: [payloadString]
        });
        // ...
    } catch (e) {
        // ...
        await fetch(`${supabaseUrl}/rest/v1/telemetry_events`, { /* telemetry_fallback_fault */ })
    }
```
**The Proving Test:** `executes mock calls to Cloudflare AI embedding arrays cleanly` in `tests/api-gateway.test.js`

3. **Target File & Line Range:** `cloudflare-workers/onyx-edge-worker/src/index.ts:168-185`
**The Exact Change:**
```typescript
      let fetchUrl = "https://api.anthropic.com/v1/messages";
      if (env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_GATEWAY_ID) {
        fetchUrl = \`https://gateway.ai.cloudflare.com/v1/\${env.CLOUDFLARE_ACCOUNT_ID}/\${env.CLOUDFLARE_GATEWAY_ID}/anthropic/v1/messages\`;
      }

      const claudeResponse = await fetch(fetchUrl, {
        method: "POST",
        headers: {
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: "claude-3-haiku-20240307",
          max_tokens: 1024,
          system: onyxSystemPrompt,
          messages: [{ role: "user", content: payloadString }]
        })
      });
```
**The Proving Test:** `should parse cf-aig-cache-status headers and log telemetry correctly via AI Gateway` in `cloudflare-workers/tests/integration.test.js`

### Wave 70: Support-to-Lab Callback Deserialization, HUD Resolution Gate & Edge Telemetry Hardening
- **Target File**: `supabase/functions/universal-dispatcher/index.ts`
  - **Exact Change**: Added parsing and ingestion logic for `ExternalCodeGenerationHandshake` inbound JSON payloads containing PR details from The Coding Lab. Updated ticket message metadata. Added robust exception capturing to route malformed payloads to `hitl_dead_letter_logs` and return structured 400 errors instead of throwing raw 500 exceptions.
  - **Proving Test**: End-to-End Workflow Validation `should simulate an inbound lab callback to universal-dispatcher successfully` verifies extraction and logic.
- **Target File**: `src/components/tickets/OnyxResolutionGate.jsx`
  - **Exact Change**: Enhanced UI to read and dynamically display PR branches, test pass rates, files changed, and commit SHA data stored in the ticket message metadata from the Lab callback payload. Updated the `handleAccept` action to securely insert `hitl_audit_logs`. Updated UI styling to dark Cyber-Onyx aesthetics with `min-h-[160px]`.
- **Target File**: `cloudflare-workers/onyx-edge-worker/src/index.ts`
  - **Exact Change**: Appended explicit rate-limit status headers (`X-AXiM-RateLimit-Remaining`) into standard response chains providing client visibility on available execution tokens.
