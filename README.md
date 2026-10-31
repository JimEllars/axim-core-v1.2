# AXiM Core

AXiM Core is the **internal control plane and data vault** of the AXiM ecosystem. It is never exposed directly to the public web: public-facing micro-apps, satellites, and the AXiM Hub all reach it through the serverless edge, and every mutating request is authenticated.

> **Firewall mandate:** Core and Onyx have no public web footprint. Client apps talk to the Hub / edge workers, which hand off to Core over authenticated, service-role-scoped channels.

## Architecture

```
Public facade (axim.us.com Hub, stateless micro-apps, Chatbase)
          │  HMAC-signed / service-role handshake
          ▼
Edge gateway (Cloudflare Workers: api.axim.us.com, core.axim.us.com)
          │
          ▼
Serverless compute (60+ Deno Supabase Edge Functions)
          │
          ▼
Persistence (Supabase PostgreSQL + pgvector, RLS-gated)
          │
          ▼
Cognitive tier (llm-proxy → DeepSeek → Anthropic → OpenAI)
```

- **Edge gateway** — Cloudflare Workers (in `cloudflare-workers/` and `workers/`) handle ingress, rate limiting (KV), and route to Edge Functions.
- **Serverless compute** — Deno Edge Functions under `supabase/functions/` implement orchestration, telemetry ingest, the MCP bridge, and satellite webhook processing.
- **Persistence** — Supabase PostgreSQL with `pgvector` (HNSW, 1536-d) and strict Row-Level Security. Migrations live in `supabase/migrations/`.
- **Cognitive tier** — `llm-proxy` routes to DeepSeek with automated fallback.
- **Visual cockpit** — React 18 / Vite HUD (`src/`) with WorkflowBuilder, CommandHub, and API test consoles.

## Repository layout

- `src/` — React/Vite dashboard (also packaged as an Electron desktop app).
- `supabase/functions/` — Deno Edge Functions (`_shared/` holds common auth/cors/crypto/ssrf helpers).
- `supabase/migrations/` — versioned SQL migrations (applied in timestamp order).
- `cloudflare-workers/` — Cloudflare Worker source (includes `mcp-bridge/`).
- `workers/` — additional edge worker (WordPress proxy).
- `satellite/` — the AXiM Satellite SDK (JWT handshake + pulse telemetry).

## Security model

- **Inter-service auth:** mutating requests present `X-Axim-Signature` (hex HMAC-SHA256 over the raw body, keyed with `AXIM_INTERNAL_KEY`). `telemetry-ingress` verifies the signature with a constant-time comparison and enforces a **5-minute replay window** via `X-Axim-Timestamp` (full header-required enforcement follows once all satellite signers emit it).
- **SSRF protection:** Edge Functions that fetch request-supplied URLs call `assertPublicUrl()` (`_shared/ssrf.ts`), which resolves DNS and rejects loopback/private/link-local addresses and internal ports (5432, 6543, 8080, 9000).
- **RLS:** service-role scoped writes; tenant-scoped read policies on all app tables.
- **PHP2Shell/CGI shielding:** edge workers reject `?-d`, `auto_prepend_file`, `allow_url_include`, `.php`, `/wp-admin`, and `xmlrpc.php`.

## Setup

```bash
# Dashboard (Vite)
npm install
npm run dev            # http://localhost:5176

# Edge Functions (Deno)
cd supabase
supabase functions serve --no-verify-jwt

# Apply migrations
supabase db push --linked
```

Environment variables are documented in `.env.example`.

## Tests

```bash
npm test               # Vitest unit/integration (dashboard + services)
npm run lint           # ESLint
npm run test:functions # smoke-test Edge Functions
```
