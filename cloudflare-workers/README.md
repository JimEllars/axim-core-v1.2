# AXiM Core Cloudflare Workers

This directory manages the AXiM Core Cloudflare API proxy:

1. `wrangler.toml` -> `axim-core-api-proxy` (edge API proxy + cache)

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
   - `ALLOWED_ORIGINS`
`SUPABASE_URL` is a public endpoint configured in the Worker manifest. Configure any sensitive production values with `wrangler secret put`; do not commit them to the manifest.

## Local development

```bash
npm run dev
```

## Deployment and verification

```bash
npm run dry-run        # Validate axim-core-api-proxy
npm run deploy         # Deploy axim-core-api-proxy
npm run check          # Integration test + dry-run
```

Tail logs with:

```bash
npm run tail
```
