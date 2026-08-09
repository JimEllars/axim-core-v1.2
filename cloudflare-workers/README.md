# AXiM Core Cloudflare Workers

This directory manages both Cloudflare Worker deployments used by AXiM Core:

1. `wrangler.toml` → `axim-core-worker` (edge API proxy + cache)
2. `onyx-edge-worker/wrangler.toml` → `onyx-edge-worker` (Onyx AI bridge)

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
2. `onyx-edge-worker/wrangler.toml`:
   - `ALLOWED_ORIGINS`
   - `SUPABASE_ANON_KEY` (secret)
   - `ANTHROPIC_API_KEY` (secret)
   - AI binding (`[ai] binding = "AI"`)

`SUPABASE_URL` is a public endpoint configured in each Worker manifest. Use `wrangler secret put` for sensitive production values:

```bash
npx wrangler secret put SUPABASE_ANON_KEY -c onyx-edge-worker/wrangler.toml
npx wrangler secret put ANTHROPIC_API_KEY -c onyx-edge-worker/wrangler.toml
```

## Local development

```bash
npm run dev
```

## Deployment and verification

```bash
npm run dry-run        # Validate axim-core-worker package
npm run dry-run:onyx   # Validate onyx-edge-worker package
npm run deploy         # Deploy axim-core-worker
npm run deploy:onyx    # Deploy onyx-edge-worker
npm run check          # Integration test + dry-runs for both workers
```

Tail logs with:

```bash
npm run tail
```
