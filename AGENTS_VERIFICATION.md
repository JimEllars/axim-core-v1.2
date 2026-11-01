# Verification for AXiM Core Wave 124

## Overview
This verifies the completion of Wave 124 which addresses:
- Cleaning up duplicate routes in the Cloudflare edge worker
- Registering the new Robotics edge ingress routes
- Provisioning the complete Robotics Platform schema migration in Supabase
- Exposing the capability in `api-capabilities`
- Extending the DAG workflow engine with robotics step handlers
- Auto-registering the Robotics Lab MCP node

## Changes Made
- `cloudflare-workers/src/index.js`: Removed duplicate entries for `/capabilities` and registered new Robotics ingress endpoints (`/api/v1/robotics/telemetry`, `/api/v1/robotics/capabilities`, `/api/v1/robotics/projects`, `/api/v1/robotics/sim`, `/api/v1/robotics/fleet/emergency-stop`).
- `supabase/migrations/20280112000000_robotics_platform_schema.sql`: Provisioned. Defines `robot_projects`, `robot_fleet_nodes`, `robot_policy_registry`, `robot_telemetry_stream`, and `robot_fault_logs` tables with standard Row-Level Security policies.
- `supabase/functions/api-capabilities/index.ts`: Added the robotics platform capability definition (`AXiM Robotics Lab Gateway`).
- `src/services/workflows/engine.js`: Registered new step handlers `robot_sim_run`, `robot_policy_gate`, and `robot_ota_deploy` in the DAG workflow engine.
- `src/services/onyxAI/serviceRegistry.js`: Dynamically auto-registered `mcp:robotics-lab`.

## Test Proof
- `npm run lint` and `npx eslint . --fix` completed successfully.
- `npx vitest run src/services/workflows/__tests__/workflow.test.js tests/e2e-workflow.test.js` passed, showing the workflow engine modifications didn't break backward compatibility and correctly execute step handlers.
- `npx esbuild src/index.js` verified the edge worker bundle.

All steps defined in the prompt have been met.

---

# Verification Log — Phase A: Unauthenticated Edge Surface (2026-10-31)

**Branch:** `fix/core-phase-a-unauth-surface`
**Base:** `f7ab7bc` (main, post-PR #481)
**Scope:** `supabase/functions/` and one migration. No frontend changes.

Four functions and one RPC were reachable by anyone holding the anon key. This change
closes them. Unlike the earlier edge work in this repo, these tests **execute the real
handlers** under Deno rather than re-declaring their logic.

## 1. `generate-embedding` — was fully unauthenticated

**Problem.** No auth check at all. It writes into `ai_interactions_ax2024` with the
service-role key, so any caller could inject attacker-authored text into the vector
memory that Onyx recalls and places inside its system prompt (RAG poisoning), choose the
`user_id` the row is attributed to, and use the project's OpenAI / Workers AI quota as a
free embedding oracle.

**Change.** `handleRequest` now resolves the caller through `_shared/edgeAuth.ts`:
internal service credential → allowed and may set `user_id`; verified JWT → allowed and
`user_id` is forced to the token's subject; anything else → 401.

**Tests.** anonymous → 401; forged bearer → 401; service bearer admitted.

## 2. `memory-retrieval` — literal fallback key, body-supplied tenant

**Problem.** Auth was `SUPABASE_SERVICE_ROLE_KEY || 'test_internal_key'`. The literal
fallback is guessable, and when the real key was set the endpoint became unusable for the
dashboard that called it. `user_id` came straight from the request body, and a null
`user_id` made `match_ai_interactions` return **every tenant's** rows.

**Change.** Caller resolved via `edgeAuth`; the literal fallback is gone; a user caller is
scoped to their own id and cannot pass one; only an internal caller may target another
tenant (or null). Handler exported for testing.

**Test.** the old `test_internal_key` value → 401.

## 3. `onyx-sentinel` — unauthenticated writes to the audit log

**Problem.** The POST handler had no auth and inserts into `hitl_audit_logs` with the
service role. `onyx-bridge` feeds the most recent of those rows to the model as
"historical precedents", so an anonymous caller could shape what Onyx is told to do.

**Change.** Caller must be internal or a verified user. Also removed the module-scope
`LISTEN telemetry_alert_bus` loop: it called `Client.waitForNotification()`, which does
not exist in `@deno/postgres` v0.17 (the file did not type-check), and an Edge Function is
torn down when the request ends, so it could never have worked.

**Test.** anonymous POST → 401.

## 4. `onyx-ui-stream` — unauthenticated stream of every tenant's rows

**Problem.** No auth, no row filter, service-role subscription to `telemetry_events`,
`blockchain_transactions`, `hitl_audit_logs`, `groundgame_support_incidents` and
`api_usage_logs`. Anyone who knew the URL received all of it.

**Change.** Caller must be internal or a verified user; the check runs **before** the
stream is constructed.

**Test.** anonymous GET → 401 with a JSON error and no stream.

## 5. Migration `20281101000001_harden_ai_rpc_surface.sql`

> Renumbered from `20281101000000` because main's #483 landed `20281101000000_fix_cron_function_urls.sql`; two migrations cannot share a version.

- **`DROP FUNCTION public.safe_sql_executor(text)`** — `SECURITY DEFINER`, granted to
  PUBLIC, no role check, executes the caller's string. A data-modifying CTE is valid
  inside its subquery, so it was arbitrary read/write as the owner. Nothing in the
  repository calls it.
- **`resolve_hitl_action`** — rebuilt with a hard guard: `service_role` via
  `request.jwt.claim.role`, or `public.is_admin()` (added by #481). Status values are
  validated; a missing record now raises instead of returning success.
  `REVOKE ALL ... FROM PUBLIC, anon` then `GRANT ... TO authenticated, service_role`.
- A dependency check at the top fails the migration if `is_admin()` is absent, so a
  partial apply cannot leave an unguarded function behind.

**Both legitimate callers preserved:** `supabase/functions/resolve-hitl` (service role,
`index.ts:66`) and `src/services/supabaseApiService.js:1406` (signed-in admin).

## Commands and results

```
deno check generate-embedding/index.ts   # ok
deno check memory-retrieval/index.ts     # ok
deno check onyx-sentinel/index.ts        # ok
deno check onyx-ui-stream/index.ts       # ok
deno test --allow-env _shared/edgeAuth_test.ts
    ok | 12 passed | 0 failed
```

Deno 2.9.8, `nodeModulesDir: none` config so only the functions are resolved.

## Proof the wiring tests fail on the base

Same suite with the four function files reverted to `f7ab7bc`:

```
FAILED | 7 passed | 6 failed
```

The six failures are the handler-level assertions: `generate-embedding` accepts anonymous
and forged callers (2), and the other four cannot import `handleRequest` because it was
not exported (4). The six helper tests pass on both — `edgeAuth.ts` is new code, not a
change to existing behaviour.

## Migration executed against a real Postgres

The migration was applied and exercised, not just read. `scripts/verify_migration.py`
boots a throwaway cluster (pgserver bundles Postgres 16.2 + pgvector), builds the minimal
Supabase surface the SQL touches (`anon`/`authenticated`/`service_role`, `auth.uid()`,
`auth.jwt()`, `is_admin()`, the three domain tables), applies the migration **verbatim**
with `ON_ERROR_STOP=1`, and asserts permissions and behaviour.

```
python3 scripts/verify_migration.py supabase/migrations/20281101000001_harden_ai_rpc_surface.sql
15/15 checks passed
migration verified against Postgres 16.2
```

What that proved:

| Check | Result |
|---|---|
| Migration applies cleanly under `ON_ERROR_STOP=1` | pass |
| `safe_sql_executor` dropped (a decoy is created first to prove it) | pass |
| `resolve_hitl_action(uuid,text,jsonb)` still exists with the same signature | pass |
| `anon` has no EXECUTE | pass |
| `service_role` has EXECUTE | pass |
| `anon` call → permission denied | pass |
| non-admin `authenticated` → `42501` | pass |
| admin `authenticated` → succeeds, status persisted | pass |
| `service_role` → succeeds | pass |
| `quarantine_app` payload actually deactivates `ecosystem_apps` | pass |
| invalid status → `22023` | pass |
| unknown record → `P0002` (no false success) | pass |

SQLSTATE codes are asserted, not just message text, by running psql with
`\set VERBOSITY verbose`.

## Still not verified

- **No live Supabase.** The fixture reproduces the parts of Supabase this migration
  touches, but it is not the project. Apply to a scratch branch before production.
- **No frontend run.** `supabaseApiService.js:1406` still calls `resolve_hitl_action`
  directly; it now requires the caller to be an admin, which preserves the intended
  behaviour but has not been exercised end to end.
- **Not changed, still open:** the four similarity RPCs are still executable by `anon`
  (`match_memory_banks` and `match_knowledge_base` have no tenant predicate at all), and
  `ecosystem_apps` / `product_feedback` still carry `FOR ALL USING (true)` policies with
  no `TO` clause. Those belong with the RAG tenancy fix, which needs a schema decision.
