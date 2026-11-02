# Wave 128 — caller authentication for `trigger-workflow`, and the credential fallbacks around it

**Branch:** `feat/core-wave-128-trigger-auth`
**Base:** `4dc7151` (main, post-PR #492)
**Date:** 2026-11-02
**Scope:** `supabase/functions/`, `src/`, one script, two test files. No migrations, no schema change.

## 1. Why this cycle went to authentication

`supabase/config.toml` has five functions with `verify_jwt = false`:

```
$ sed -n '5,22p' supabase/config.toml
[functions.api-gateway]              verify_jwt = false
[functions.create-checkout-session]  verify_jwt = false
[functions.create-portal-session]    verify_jwt = false
[functions.voice-ingest]             verify_jwt = false
[functions.trigger-workflow]         verify_jwt = false
```

Four of the five authenticate themselves. `api-gateway` validates against the `api_keys`
table; `create-checkout-session`, `create-portal-session` and `voice-ingest` all call
`supabase.auth.getUser()`. `trigger-workflow` did not check anything at all:

```ts
// before
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await req.json();
    const { workflowId, workflowSlug, context = {}, userId } = body;   // trusted verbatim
```

That function runs with `SUPABASE_SERVICE_ROLE_KEY`. An anonymous `POST` could therefore:

* enumerate any workflow by id, slug **or name** (`query.or('id.eq.${body.workflow},…')`),
* execute its nodes, including the legacy branches that insert into `events_ax2024` and
  `tasks`,
* write a `workflow_execution_logs` row with `user_id` set to whatever the body claimed,
  so the audit trail recorded the wrong actor.

This is the same class of hole PR #489 closed on the AI surface, on the one endpoint that
executes arbitrary action graphs. It is also why `universal-dispatcher` matters: it relays
`lead.created` webhooks straight into it.

## 2. What the fix does

**`supabase/functions/_shared/workflowAuth.ts`** (new, 73 lines) holds the rule as a pure
function so it can be tested under Node:

| Caller | `body.userId` | Result |
|---|---|---|
| anonymous | anything | `401`, refused |
| internal (service key) | `user-abc` | run recorded as `user-abc` |
| internal | absent | run recorded with no owner |
| verified user | absent | run recorded as the caller |
| verified user | own id | run recorded as the caller |
| verified user | someone else's id | `403`, refused |
| verified user | `"system"` | `403`, refused |

**`supabase/functions/trigger-workflow/index.ts`** — resolves the caller before reading the
body, using the primitives #489 introduced (`keysFromEnv`, `resolveCaller`), and derives the
run identity from credentials rather than from the request:

```ts
const caller = await resolveCaller(req.headers, keysFromEnv(Deno.env), async (token) => {
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user.id;
});
if (caller.kind === 'anonymous') return json({ error: 'Unauthorized', reason: … }, 401);
…
const decision = authorizeTrigger(caller, body.userId);
if (!decision.ok) return json({ error: 'Forbidden', reason: decision.reason }, decision.status);
const userId = decision.actorId;
```

No caller had to change to keep working — verified by reading each one:

| Caller | Credential it already sent | Classified as |
|---|---|---|
| `job-processor/index.ts:131` | `Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}` | internal |
| `universal-dispatcher/index.ts:61` | `Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}` | internal |
| `WorkflowBuilder.jsx:414` | `functions.invoke` → supabase-js attaches the session JWT | user |
| `workflowCommands.js` | service-role key from `VITE_*` — **changed**, see §3 | user |
| `job-processor` body | `workflowName: command` | 404 path unchanged |

## 3. The fallbacks were credentials

`universal-dispatcher` authenticated with `AXIM_SERVICE_KEY || "fallback_internal_key"`, and
that same literal was compiled into the dashboard bundle:

```
$ git show 4dc7151:supabase/functions/universal-dispatcher/index.ts | sed -n '11,14p'
const AXIM_SERVICE_KEY =
  (Deno.env.get("AXIM_SERVICE_KEY") as string) ||
  (Deno.env.get("AXIM_INTERNAL_SERVICE_KEY") as string) ||
  "fallback_internal_key";

$ git show 4dc7151:src/hooks/useCommandHandler.js | grep -n "fallback_internal_key"
69:  const internalKey = import.meta.env.VITE_AXIM_SERVICE_KEY || … || 'fallback_internal_key';
```

The client and the server authenticated each other with a string printed in the deployed
JavaScript. When the env var was missing, the pair still worked — and nobody was
authenticated at all. Nine files carried a version of this:

| File | Was | Now |
|---|---|---|
| `universal-dispatcher/index.ts` | `\|\| "fallback_internal_key"` on the inbound check **and** on every outbound bearer | `resolveCaller`; `internalAuth()` throws when unset |
| `communication-gateway/index.ts` | unused constant, still shipped the literal | removed |
| `vault-upload/index.ts` | `\|\| 'fallback_internal_key'` | fails closed when unset |
| `omnichannel-publisher/index.ts` | `SUPABASE_SERVICE_ROLE_KEY \|\| 'test_internal_key'` | fails closed when unset |
| `ground-game-assign/index.ts` | same | fails closed when unset |
| `roundups-connector/index.ts:207` | `\|\| "fallback_internal_key"` on `launch_campaign` | fails closed; readers accept a verified user |
| `axim-content-engine/index.ts:378` | outbound `X-Axim-Internal-Service-Key` with `\|\| "test_internal_key"` | refuses to call the publisher without a real key |
| `ChatMessage.jsx:159` | `VITE_ONYX_SECURE_KEY \|\| 'default-auth-token'` | throws a named error instead |
| `useCommandHandler.js`, `systemCommands.js` | same literal, client-side | session token via `sessionAuth.js` |

## 4. The browser no longer holds service credentials

`VITE_*` values are inlined into the public bundle, so `VITE_SUPABASE_SERVICE_ROLE_KEY`
in `workflowCommands.js`, `integrationCommands.js` and `systemCommands.js` was either a
leaked full-database credential or, more likely, never set — in which case every one of
those commands sent `Bearer undefined` and failed. `systemCommands.troubleshootApp` went
further and built a second Supabase client in the browser with that key.

**`src/services/sessionAuth.js`** (new, 29 lines) is now the single place that turns the
current session into an `Authorization` header, and the receiving functions accept a
verified user:

| Function | Change |
|---|---|
| `roundups-connector` | read-only actions accept a verified user; `launch_campaign` stays internal-only because it moves money |
| `universal-dispatcher` | accepts a verified user |
| `send-email` | accepts a verified user in addition to a micro-app session JWT |
| `memory-retrieval`, `generate-embedding` | already accepted a verified user (#489); the client just stopped sending a fake internal key at them |

Not changed, and deliberately recorded in the plan: `VITE_ONYX_SECURE_KEY` is still used to
HMAC-sign requests straight to the Onyx edge bridge from five modules. Removing it needs a
Core relay plus an Onyx-side change, so it is the next cycle's top item rather than a
half-done edit here.

## 5. The gate

**`scripts/check-credentials.mjs`** (`npm run check:creds`, 210 lines) strips comments
(quote-aware, position-preserving), then scans:

* every `supabase/functions/**/*.ts` (excluding `*_test.ts`) for
  `fallback_internal_key`, `test_internal_key`, `default_internal_key_fallback`,
  `default-auth-token`;
* everything shipped from `src/` for those literals **and** for
  `VITE_SUPABASE_SERVICE_ROLE_KEY`, `VITE_AXIM_SERVICE_KEY`,
  `VITE_AXIM_INTERNAL_SERVICE_KEY`.

Behind it, `tests/check-credentials.test.js` proves the scanner actually fails — a
violation fixture per rule, a comment-only mention that must not trip, a line-number
assertion, and a near-miss identifier (`fallback_internal_key_v2_suffix`) that must not
match.

## 6. Verification

Environment: 2 vCPU, 3.9 GB, Node 22.23.4. `NODE_ENV=production` is set in this shell, so
every test run below explicitly sets `NODE_ENV=test` — without it React resolves its
production build and `@testing-library` cannot call `act()`.

| Check | Command | Result |
|---|---|---|
| Deno sources parse | `npm run check:edge` | `Edge syntax OK: parsed 96 Deno source(s) under supabase/functions.` (was 95; +`workflowAuth.ts`) |
| No credential fallbacks | `npm run check:creds` | `no literal credential fallbacks in server or client code.` |
| New unit tests | `npx vitest run tests/workflow-auth.test.js tests/check-credentials.test.js` | **21 passed** (11 + 10) |
| Affected suites | 8 files incl. `integrationCommands`, `commandRouter`, `command-hub`, `ChatInterface` | **7 passed, 1 skipped; 37 passed, 4 skipped** |
| Full suite (baseline, pre-change tree) | `npx vitest run --maxWorkers=2` | **94 passed, 2 skipped; 478 passed, 9 skipped; exit 0** |
| Lint | `npm run lint` | **0 errors**, 7 pre-existing `react-refresh` warnings in `src/contexts/*.jsx` |
| Worker bundle | `npx esbuild src/index.js --bundle` | `8.8kb`, done in 82ms |
| Worker deploy | `npx wrangler deploy --dry-run -c wrangler.toml` | `Total Upload: 30.71 KiB / gzip: 7.28 KiB`, dry-run OK |

Verbatim, the full suite:

```
$ NODE_ENV=test npx vitest run --maxWorkers=2
 Test Files  94 passed | 2 skipped (96)
      Tests  478 passed | 9 skipped (487)
   Duration  3392.49s (transform 123.37s, setup 107.85s, collect 1414.40s, tests 316.39s, environment 3333.49s, prepare 642.36s)
EXIT=0
```

The two skipped files are the pre-existing `describe.skip` suites
(`DeviceManager` flake and `onyxAI/commands/workflow`), unchanged here.

Verbatim, the gate:

```
$ npm run check:edge
Edge syntax OK: parsed 96 Deno source(s) under supabase/functions.

$ npm run check:creds
check:creds — no literal credential fallbacks in server or client code.

$ NODE_ENV=test npx vitest run tests/workflow-auth.test.js tests/check-credentials.test.js
 ✓ tests/check-credentials.test.js  (10 tests) 1610ms
 ✓ tests/workflow-auth.test.js  (11 tests) 81ms
 Test Files  2 passed (2)
      Tests  21 passed (21)
```

Verbatim, the test that had to change because the behaviour changed:

```
 ✓ src/services/onyxAI/commands/__tests__/integrationCommands.test.js  (4 tests) 238ms
```

Its old assertion pinned `Authorization: Bearer test-service-key` (the service-role key).
It now pins `Bearer test-session-token` and additionally asserts the request carries no
`X-Axim-Internal-Service-Key` and no service key.

### What could not be verified here

* **No live call against the deployed function.** This workspace holds no Supabase
  project credentials, so the 401 path is proven by unit test and by reading the deployed
  config (`verify_jwt = false`), not by an anonymous `curl` returning 401. If the function
  is redeployed and probed with `curl -X POST …/functions/v1/trigger-workflow`, the expected
  answer is `401 {"error":"Unauthorized"}`.
* **`deno check` and the three Deno test files** still do not run: no `deno` binary here and
  no Deno step in any workflow (unchanged from Wave 127, item 4b).

## 7. Environment note that cost an hour

The full suite appears to hang. It does not. Measured tonight: 96 files, jsdom environment
costing 8–10 s per file, ~56 minutes at `--maxWorkers=2` on two vCPUs. `collect` alone is
1414 s. An earlier 900 s timeout made it look like a stall. This closes the open question
in the plan; the suite is slow, not broken, and it needs a bigger runner before it can gate
PRs.
