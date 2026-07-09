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
