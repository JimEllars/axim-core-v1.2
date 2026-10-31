# Verification Appendix — Phase 0: Removal of Self-Fulfilling Tests

**Branch:** `chore/core-phase0-delete-stub-tests`
**Base:** `f7ab7bc` (main, post-PR #481)
**Date:** 2026-10-31

## Why this change exists

The suite reported 506 passing tests while zero of the 78 Supabase Edge Functions was
imported by any of them. 49 of the 64 tests under `tests/` re-declared the production
logic inside the test body and asserted on that copy, so they reported green coverage of
modules that had none and could not fail when production behaviour changed.

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
