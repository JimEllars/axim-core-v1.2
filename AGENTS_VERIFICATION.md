# Verification Appendix — Phase 0: Removal of Self-Fulfilling Tests

**Branch:** `chore/core-phase0-delete-stub-tests`
**Base:** `f7ab7bc` (main, post-PR #481)
**Date:** 2026-10-31

## Why this change exists

The suite reported 506 passing tests while zero of the 78 Supabase Edge Functions was
imported by any of them. 49 of the 64 tests under `tests/` re-declared the production
logic inside the test body and asserted on that copy, so they reported green coverage of
modules that had none and could not fail when production behaviour changed.

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

## Bug found by the harness: `getUser()` vs `getUser(token)`

`generate-embedding` and `memory-retrieval` called `verified.auth.getUser()` with no
argument. With no session attached to the client, supabase-js makes **no request at all**
and returns a null user — so a *valid* user token was being treated as anonymous. The
negative tests passed for the wrong reason (everything was rejected, including real
users). Both now call `getUser(token)`, and there is a positive-path test asserting the
token is actually verified and the caller admitted.

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

This is the single change that makes every later verification claim meaningful: after it,
a green run means the tests that remain actually exercise code.

## Target files and line ranges (at base `f7ab7bc`)

### Deleted — every `it()` asserted on locally re-declared logic

| File | Tests | Why it proved nothing |
|---|---|---|
| `tests/llm-proxy.test.js` | 4 | Re-implemented endpoint selection, tool normalisation and failover inline; one test was `expect(true).toBe(true)` |
| `tests/document-qa.test.js` | 1 | Built its own `Map` cache and asserted on that; the file's own comment says "The document-qa index.ts doesn't export a module to test easily" |
| `tests/job-processor.test.js` | 2 | `currentAttempts + 1` arithmetic on literals |
| `tests/dead-letter-jobs.test.js` | 2 | Same pattern for retry thresholds |
| `tests/satellite-e2e.test.js` | 1 | In-memory `mockDatabase` object; asserted on its own fixture |
| `tests/integration-proxy.test.js` | 2 | Raced a local `fetch` against a local `setTimeout` |
| `tests/smart-contract-dispatcher.test.js` | 2 | Mocked the Safe SDK, then asserted the mock's return value |
| `tests/api-gateway-rate-limit.test.js` | 1 | `expect(true).toBe(true)` |
| `tests/telemetry-pipeline.test.js` | 1 | `expect(1).toBe(1)` |
| `tests/campaign-processor.test.js` | 1 | `expect(true).toBe(true)` |
| `tests/ui-smoke.test.jsx` | 6 | Asserted on local object literals |
| `tests/settings.test.jsx` | 1 | `expect(true).toBe(true)` |
| `tests/user-profile.test.jsx` | 2 | `expect(true).toBe(true)` ×2 |
| `tests/integrations-manager.test.jsx` | 1 | `expect(true).toBe(true)` |

### Trimmed — kept the tests that import production code

| File | Before → after | Kept | Removed |
|---|---|---|---|
| `tests/api-gateway.test.js` | 20 → 6 tests | The 6 that `await import('../src/services/apiProxy.js')` (wallet telemetry, 502/503/504 degradation, Error 1033 degradation, rate-limit event, healthy event, Onyx MK3 routing) | 14 tests that re-implemented auth, sliding-window limiting, llm-proxy calls, embeddings and cron health |
| `tests/e2e-workflow.test.js` | 8 → 1 test | `should sanitize PII in the payload` — imports `universal-dispatcher/sanitization.ts` | 7 simulations (scraper concurrency, burst latency, DLQ retry, ErrorBoundary, dispatcher callback, merge webhook, API-key telemetry) |
| `tests/edge-worker.test.js` | 3 → 2 tests | Rate-limit passthrough (asserts the real 404 fallback) and static-asset cache headers | `returns 429 when rate limit is exceeded` — an `expect(true).toBe(true)` whose comment admits the rate limiter was removed from `index.js` |

## Proving counts

Same command, same base, before and after:

```
NODE_ENV=test ./node_modules/.bin/vitest run tests/
```

| | Test files | Tests |
|---|---|---|
| Before (`f7ab7bc`) | 8 | **78** |
| After | 8 | **29** |
| Delta | — | **−49** |

Full suite, after the change:

```
NODE_ENV=test ./node_modules/.bin/vitest run --reporter=dot
 Test Files  92 passed | 2 skipped (94)
      Tests  457 passed | 9 skipped (466)
   Duration  947.62s
```

457 = 506 − 49, and 94 files = 108 − 14. No production module was touched, so every
remaining test exercises the same code as before.

Lint:

```
./node_modules/.bin/eslint . --quiet
exit=0
```

> Note on measurement: an intermediate full run reported 465 tests. That number is
> discarded — a concurrent `git checkout` in this shared workspace reset the tree
> mid-run. The 457 figure above was taken with the tree quiescent and is the one to cite.

## What this change does NOT prove

It adds no coverage. It removes the appearance of coverage. Specifically:

- `job-processor`, `dead_letter_jobs`, `campaign-processor`, `llm-proxy`, `document-qa`,
  `smart-contract-dispatcher`, `generic-axim-service-proxy`, `telemetry-pipeline` and the
  Satellite E2E round trip now have **no test at all**. That is the honest state; the
  previous green ticks were fiction. Writing real tests for them is Phase 0 follow-up work.
- `supabase/functions/onyx-bridge`, `onyx-edge-worker`, `onyx-sentinel`, `onyx-ui-stream`,
  `generate-embedding`, `memory-retrieval`, `document-qa`, `voice-ingest` remain untested.
- 21 equally self-fulfilling tests remain under `src/` (for example
  `src/services/__tests__/telemetry.test.js`, `src/hooks/useContacts.test.js`,
  `src/services/__tests__/deviceManager.test.js`, `src/services/__tests__/apiClient.test.js`).
  They were out of scope for this change and are the next decision point.

## Documentation corrected in the same commit

- `AGENTS.md:13` — the protocol's exemplar "proving test" was `job-processor edge function
  logic` in `tests/job-processor.test.js`, i.e. the very file that could never fail. The
  example now points at `src/services/onyxAI/__tests__/commandRouter.test.js`, which
  imports the real module.
- `MICRO_APPS_INTEGRATION.md:79` — claimed the satellite artefact pipeline is "verified
  continuously within the end-to-end Vitest suite (`tests/e2e-workflow.test.js`)". That
  file now holds one PII-sanitisation test. The claim is corrected rather than left to
  mislead.

## Deliberately not changed

- `DEBUGGING_NOTES.md:224,230,241` cite the deleted files in past-tense log entries. This
  is a historical record of what was run at the time; it is not rewritten.
- `PR_DESCRIPTION.md` references `tests/llm-proxy.test.js` in an already-merged PR
  description. Historical.
- `reusable-run-tests.yml` still has no caller. Deleting stub tests does not make CI run
  the real ones — that is the next Phase 0 step and it is not solved here.
