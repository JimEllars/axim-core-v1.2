
> **CRITICAL ARCHITECTURE WARNING**
> Supabase CLI via `supabase db push` strictly targets and applies migrations located in `supabase/migrations/`. The root-level `migrations/` folder has been deprecated and completely removed. All structural data changes, tables, and functions have been consolidated into `supabase/migrations/`.

# Edge Functions Deployment Manifest

This document tracks all active Edge Functions, their required secrets, and associated cron jobs.

## Active Functions

| Function Name | Description | Required Secrets / Vault Keys | Associated Cron Job / Trigger |
|---|---|---|---|
| `ace-wp-callback` | Handles WordPress publishing events | `WP_AUTH_KEY` | None |
| `affiliate-lead-ingest` | Ingests affiliate leads | None | None |
| `albato-connector` | Dispatches webhooks to Albato | `ALBATO_WEBHOOK_URL` | None |
| `api-capabilities` | Exposes available micro-apps | None | None |
| `api-gateway` | Main API proxy & router | `SUPABASE_SERVICE_ROLE_KEY` | None |
| `api-proxy` | Generic proxy | None | None |
| `audit-export` | Exports audit logs to secure bucket | `SUPABASE_SERVICE_ROLE_KEY` | None |
| `auto-healer` | Quarantines failed nodes | None | Triggered by RCA |
| `autonomous-billing` | Mid-cycle invoicing | `STRIPE_SECRET_KEY` | None |
| `autonomous-lead-scraper` | Lead scraper | None | None |
| `axim-content-engine` | Automated content engine | None | `pg_cron` (daily) |
| `axim-scraper` | General scraper | None | None |
| `axim-transcribe` | Transcribes audio | None | None |
| `chatbase-sync` | Syncs Chatbase data | None | None |
| `cognitive-compression` | Summarizes older data | `SUPABASE_SERVICE_ROLE_KEY` | `pg_cron` |
| `communication-gateway` | Inbound email webhook | None | None |
| `create-checkout-session` | Stripe checkout | `STRIPE_SECRET_KEY` | None |
| `create-portal-session` | Stripe portal | `STRIPE_SECRET_KEY` | None |
| `crm-reconciliation` | Syncs CRM data | None | None |
| `device-communication` | Connects devices | None | None |
| `device-status` | Device health check | None | None |
| `document-qa` | RAG on documents | None | None |
| `email-tracking-webhook` | EmailIt webhook | None | None |
| `engagement-guard` | Churn mitigation | None | `pg_cron` |
| `executive-report` | Weekly snapshot | None | `pg_cron` |
| `feedback-ingest` | Ingests product feedback | None | None |
| `financial-audit` | Audits finances | None | None |
| `gateway-heartbeat` | Gateway health check | None | `pg_cron` |
| `generate-embedding` | Vectorizes text | None | Database Trigger |
| `generic-axim-service-proxy`| Generic service proxy | `SUPABASE_SERVICE_ROLE_KEY` | None |
| `google-drive-export` | Exports data to Drive | `GOOGLE_SERVICE_ACCOUNT` | None |
| `ground-game-assign` | Field operator routing | None | None |
| `job-processor` | Background tasks | None | None |
| `knowledge-ingest` | Ingests KB data | None | None |
| `llm-proxy` | Routes LLM queries | Provider API Keys | None |
| `memory-retrieval` | RAG retrieval | None | None |
| `omnichannel-publisher` | Publishes to socials | None | None |
| `onyx-bridge` | Proxy to Onyx Mk3 | `SUPABASE_SERVICE_ROLE_KEY` | None |
| `onyx-edge-worker` | Onyx edge processing | `AXIM_ONYX_SECRET`, `ANTHROPIC_API_KEY` | None |
| `onyx-sentinel` | Notifies Onyx of node failure | None | Database Trigger |
| `onyx-ui-stream` | Streams UI updates | None | None |
| `osint-scraper` | OSINT gathering | None | None |
| `passport-verify` | SSO/Health verification | `SUPABASE_SERVICE_ROLE_KEY` | None |
| `podcast-poller` | Polls podcasts | None | None |
| `predictive-engagement` | Analyzes engagement | None | None |
| `resolve-hitl` | HITL resolution | None | None |
| `roundups-connector` | Roundups integration | None | None |
| `satellite-telemetry` | Captures Web3 telemetry | None | None |
| `send-email` | Sends emails via EmailIt | `EMAILIT_API_KEY` | None |
| `sentry-rca-handler` | Sentry integration | None | None |
| `smart-contract-dispatcher` | Dispatches Web3 contracts | None | None |
| `strategy-snapshot` | Analyzes strategies | None | None |
| `stream-webhook` | Live stream events | None | None |
| `stripe-webhooks` | Stripe webhooks | `STRIPE_WEBHOOK_SECRET` | None |
| `system-status` | Aggregates health | `SUPABASE_ANON_KEY` | None |
| `telemetry-archiver` | Archives old telemetry | None | `pg_cron` |
| `telemetry-ingress` | General telemetry | None | None |
| `transcription-webhook` | Audio transcription events | None | None |
| `trigger-workflow` | Workflow execution | None | None |
| `universal-dispatcher` | Webhook dispatch | None | None |
| `uptime-monitor` | Node health pinger | `SUPABASE_SERVICE_ROLE_KEY` | None |
| `vault-upload` | Uploads to vault | None | None |
| `voice-ingest` | Live prep gateway | None | None |
| `webhook-dispatch` | External webhooks | None | None |
| `wordpress-proxy` | WP integration | None | None |
| `wordpress-publisher` | Publishes to WP | None | None |

## Smoke Test Instructions

To verify all functions are responding, run:
`npm run test:functions`
