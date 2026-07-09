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

Update both Wrangler config files before deployment:

1. `wrangler.toml`:
   - `SUPABASE_URL`
   - `ALLOWED_ORIGINS`
2. `onyx-edge-worker/wrangler.toml`:
   - `AXIM_ONYX_SECRET`
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - AI binding (`[ai] binding = "AI"`)

Use `wrangler secret put` for sensitive production values instead of checking secrets into config.

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
