# AXiM Core Cloudflare Workers

This directory manages the AXiM Core Cloudflare API proxy:

1. `wrangler.toml` -> `axim-core-worker` (edge API proxy + cache)
2. `mcp-bridge/wrangler.toml` -> `axim-core-mcp` (authenticated MCP bridge)

## Prerequisites

1. Node.js 22+
2. Cloudflare account access with Worker deploy permission
3. Wrangler authentication

```bash
npx wrangler login
```

## Install

```bash
npm install
```

## Configure

Set the required Worker secrets before deployment. Do not add secrets to a Wrangler config file or a `VITE_*` browser variable:

1. `wrangler.toml`:
   - Set `ALLOWED_ORIGINS` to the complete, comma-separated list of dashboard origins.
   - Replace the checked-in `TELEMETRY_RETRY_KV` namespace ID with the ID returned by
     `npx wrangler kv namespace create TELEMETRY_RETRY_KV`. The checked-in ID is a
     non-deployable example value.
`SUPABASE_URL` is a public endpoint configured in the Worker manifest. Configure any sensitive production values with `wrangler secret put`; do not commit them to the manifest.

2. Configure the MCP bridge:

```bash
cd mcp-bridge
npx wrangler secret put AXIM_GATEWAY_TOKEN
```

The MCP bridge rejects all requests until this secret is set.

## Local development

```bash
npm run dev
```

## Deployment and verification

```bash
npm run dry-run        # Validate axim-core-api-proxy
npm run deploy         # Validate axim-core-api-proxy for Cloudflare Git Builds
npm run deploy:production # Manually deploy axim-core-api-proxy
npm run check          # Integration test + dry-run
cd mcp-bridge && npm run test && npm run deploy:production
```

Tail logs with:

```bash
npm run tail
```
