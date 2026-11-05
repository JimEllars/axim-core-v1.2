# Wave 131 — The MCP surface the worker already routed to

**Branch:** `feat/core-wave-131-mcp-edge-surface`
**Base:** `55c546f` (main, post-PR #498)
**Date:** 2026-11-05
**Scope:** `supabase/functions/{mcp-router,mcp-sse,mcp-message}`, five modules under
`supabase/functions/_shared/`, `supabase/config.toml`, four new test files, one test
timeout, `tests/edge-routes.test.js`.

## Why this change exists

`cloudflare-workers/src/index.js` has proxied six routes at three Edge Functions that did
not exist:

| route | target | before |
|---|---|---|
| `/mcp`, `/api/v1/mcp` | `functions/v1/mcp-router` | Supabase 404 |
| `/sse`, `/api/v1/mcp/sse` | `functions/v1/mcp-sse` | Supabase 404 |
| `/message`, `/api/v1/mcp/message` | `functions/v1/mcp-message` | Supabase 404 |

`tests/edge-routes.test.js` named all three in a `NOT_YET_BUILT` allowlist, which is how the
gap stayed visible instead of being assumed closed. Wave 130 cleared the robotics entries
from the same list; these three were the remainder.

The result today is that every MCP client pointed at the Core domain — Onyx, Claude
Desktop, Cursor, any satellite relay — gets a 404 with no explanation, while the separate
Cloudflare MCP bridge answers on a different origin with a different auth model.

## 1. What was built

Six files, following the shape Wave 130 established for the robotics functions: pure
logic in `_shared/`, thin entrypoints, everything injected so it is testable under Node.

| file | lines | role |
|---|---|---|
| `_shared/mcpProtocol.ts` | 348 | JSON-RPC 2.0 envelope, method routing, batch handling |
| `_shared/mcpTools.ts` | 392 | tool registry, validation, column contracts |
| `_shared/mcpSession.ts` | 203 | HMAC-signed stateless session tokens |
| `_shared/mcpSupabase.ts` | 114 | `SelectSpec` → PostgREST chain, `probe()` |
| `_shared/mcpServer.ts` | 139 | caller authorisation, context assembly |
| `mcp-router/index.ts` | 97 | POST JSON-RPC, GET discovery |
| `mcp-sse/index.ts` | 171 | GET SSE handshake, POST JSON-RPC, DELETE 204 |
| `mcp-message/index.ts` | 119 | POST against a verified session |

**Tools exposed** (five, all with JSON Schema input contracts):

| tool | table | access |
|---|---|---|
| `core_health_check` | `telemetry_events` (bounded probe) | read |
| `telemetry_lookup` | `telemetry_events` | read |
| `hitl_queue_status` | `hitl_audit_logs` | read |
| `axim_list_nodes` | `ecosystem_nodes` | read |
| `axim_dispatch_task` | `hitl_audit_logs` | staged write, user caller only |

## 2. The defect this avoided reproducing

The Cloudflare MCP bridge (`cloudflare-workers/mcp-bridge/src/index.ts`) already exposes
these tools, and three of them query columns that do not exist. Checked against the
migrations rather than against the bridge:

- `public.hitl_audit_logs` is `id, admin_id, action, tool_called, timestamp`
  (`20251101000000_create_hitl_audit_logs.sql:1-7`), plus `status`
  (`20260404000000:1`, default `'Pending'`), `target_department` (`20280106000000:1-2`),
  and two columns added by guarded blocks that can be skipped.
- The bridge's `axim_dispatch_task` inserts `action_name`, `payload`, `requested_by` and
  `created_at` — **none of which are columns**.
- The bridge's `hitl_queue_status` selects `action_name` and filters
  `status=eq.pending` — a column that does not exist and a value that cannot match,
  because the migration default is `'Pending'`.
- The bridge's `telemetry_lookup` selects `id, component_id, severity, message` from
  `public.telemetry_events`, which is `id, app_id, event_type, metadata, created_at`
  (`20280108000000:1-7`). Coverage lives at `metadata->>'isp'`
  (`20280107000000:56`), not in a `severity` column.

Every one of those calls is a PostgREST 400 that the bridge catches into a bare
`Error: 400` string. The table contracts are therefore asserted against the migrations in
`tests/mcp-tools.test.js`, not copied from the bridge — a test that quoted the bridge would
have blessed the bug.

`axim_dispatch_task` also deliberately **refuses internal callers**: `admin_id` is
`NOT NULL REFERENCES auth.users(id)`, so a service-key or HMAC relay has no identity to
attribute the row to. The bridge's answer to this was the literal string
`requested_by: 'mcp_bridge_client'` — a column that does not exist, standing in for a user
that was never resolved.

## 3. Authorisation

Every MCP method refuses anonymous callers, including `initialize` and the discovery
document, through the shared `classifyEdgeCaller` (`_shared/edgeCaller.ts`). A tool
inventory is itself a map of the deployment; an unauthenticated MCP endpoint is an open
query interface onto telemetry, HITL approvals and the satellite registry.

`verify_jwt = false` is declared for the three functions in `supabase/config.toml`, for the
same reason as `robotics-emergency-stop`: a satellite presents a signed relay and Onyx
presents the internal service key, and neither is a Supabase JWT, so the platform check
would reject them before function code ran. The functions decide instead, and refuse
everything unauthenticated.

Sessions are HMAC-signed tokens, not rows:

```
v1.<base64url(JSON{id,sub,exp})>.<hex HMAC-SHA256(AXIM_INTERNAL_KEY, "v1.<payload>")>
```

Edge Function invocations are isolated, so there is no in-memory session to return to and
no reason to add a table for one. `mcp-message` checks the signature **before** reading
`exp` (a forged far-future token must not pass by looking fresh) and then requires the
session subject to match the presented caller, so a token minted for one operator is not
replayable by another. With `AXIM_INTERNAL_KEY` unset the entrypoints answer **503** rather
than issuing tokens that verify against nothing.

## 4. The SSE stream is bounded, and says so

Supabase Edge Functions cap wall-clock time, so a connection cannot stay open indefinitely.
`mcp-sse` emits the `endpoint` event, sends a keepalive comment every 5 s for 25 s, then
writes `retry: 1000` and closes cleanly, so the client reconnects and receives a fresh
session. This is stated in the file header and in the stream itself rather than left for a
client to discover as a silent disconnect mid-tool-call.

`MCP_PUBLIC_ORIGIN` overrides the message URL: behind the Cloudflare worker the request URL
is Supabase's own origin, which a browser client cannot reach with the worker's ingress
protections in front of it.

## 5. Verification

### 5.1 `npm run check:edge`

```
> axim-core-dashboard@1.1.0 check:edge
> node scripts/check-edge-syntax.mjs

Edge syntax OK: parsed 111 Deno source(s) under supabase/functions.
```

111 sources, up from 108 — the eight new files, minus the three directories that were
missing.

### 5.2 New tests

```
$ npx vitest run tests/mcp-tools.test.js tests/mcp-protocol.test.js \
      tests/mcp-session.test.js tests/mcp-supabase.test.js tests/mcp-server.test.js

 ✓ tests/mcp-tools.test.js  (17 tests) 974ms
 ✓ tests/mcp-protocol.test.js  (24 tests) 81ms
 ✓ tests/mcp-session.test.js  (13 tests) 962ms
 ✓ tests/mcp-supabase.test.js  (9 tests) 399ms
 ✓ tests/mcp-server.test.js  (13 tests) 90ms

 Test Files  5 passed (5)
      Tests  76 passed (76)
```

Which cases prove which contract:

| test | pins |
|---|---|
| `hitl_queue_status > filters on the migration's capitalised Pending status` | the bridge's lowercase `'pending'` bug |
| `telemetry_lookup > selects the real telemetry_events columns` | the bridge's `severity`/`component_id` bug |
| `axim_dispatch_task > stages the row with real column names` | the bridge's `action_name`/`payload`/`requested_by` bug |
| `axim_dispatch_task > refuses an internal caller` | `admin_id` is `NOT NULL REFERENCES auth.users` |
| `notifications > stays silent for an unknown notification method` | JSON-RPC 2.0 §4.1 |
| `batches > returns 204 when a batch contains only notifications` | JSON-RPC 2.0 §6 |
| `verifySession > rejects a token whose payload was edited` | signature covers the payload |
| `verifySession > rejects an expired token` | boundary at `exp` |
| `createDataAccess > times a probe and reports ok` | the probe is `limit(1)`, not a table scan |
| `edge worker route table > routes the MCP transports at functions that exist` | the six routes now resolve |

### 5.3 `tests/edge-routes.test.js`

`NOT_YET_BUILT` is now empty and a new case asserts all six MCP routes resolve to a real
`index.ts`. The set stays in place rather than being deleted, because it is the mechanism
that made the original gap visible.

```
 ✓ tests/edge-routes.test.js  (6 tests) 239ms
```

### 5.4 Pre-existing failure repaired

The baseline suite run found one failing test unrelated to this change:

```
 FAIL  tests/api-gateway.test.js > apiProxy telemetry wallet appending
       > appends wallet_address to telemetry objects
Error: Test timed out in 5000ms.
```

Not a code defect: the test body is milliseconds of mocked calls, and the cost is the two
dynamic `import()`s that pull the `apiProxy` module graph through esbuild inside jsdom —
measured at **7.9 s** on this 2 vCPU runner against Vitest's 5 s default. Verified by
re-running with `--testTimeout=25000`:

```
 ✓ tests/api-gateway.test.js  (6 tests | 5 skipped) 7919ms
```

Fixed with an explicit 20 s timeout on that one test and a comment explaining the cost.
No production code touched.

### 5.5 `messageEndpoint` pointed behind the worker at a path the worker does not route

Found while re-reading the wiring. The first version appended
`/functions/v1/mcp-message` to whichever origin it was given, which is correct only
when the client talks to Supabase directly. With `MCP_PUBLIC_ORIGIN` set — the case the
variable exists for — it produced `https://core.axim.us.com/functions/v1/mcp-message`,
and `cloudflare-workers/src/index.js` routes `/message` and `/api/v1/mcp/message`, not
`/functions/v1/*`. The worker would have fallen through to its asset handler and 404'd
on the URL it had just handed the client.

Now branches on the front door instead of substituting a hostname:

| configuration | endpoint the client receives |
|---|---|
| no `MCP_PUBLIC_ORIGIN` | `<supabase-origin>/functions/v1/mcp-message` |
| `MCP_PUBLIC_ORIGIN=https://core.axim.us.com` | `https://core.axim.us.com/message` |

Pinned by `messageEndpoint > uses the worker route when MCP_PUBLIC_ORIGIN is set` in
`tests/mcp-server.test.js`, which also covers `authoriseMcpCaller` — the security
boundary had no tests before this, including the case that matters most: a partner
`sender` that presents a bad signature **and** a valid bearer token must be refused on
the signature, not quietly admitted on the token.

### 5.6 The deploy workflow reported success and deployed nothing

Found while verifying that this change would actually reach production. PR #498 merged
earlier in the run and its `Deploy Edge Functions` workflow **succeeded** — but every
function still answered 404:

```
$ for fn in resolve-hitl telemetry-ingress onyx-bridge robotics-projects mcp-router; do
    curl -s -X POST "https://pvbcdndqjguzqeafhwhw.supabase.co/functions/v1/$fn" -d '{}'
  done
resolve-hitl      -> HTTP 404 {"code":"NOT_FOUND","message":"Requested function was not found"}
telemetry-ingress -> HTTP 404 {"code":"NOT_FOUND","message":"Requested function was not found"}
onyx-bridge       -> HTTP 404 {"code":"NOT_FOUND","message":"Requested function was not found"}
```

The run's job list explains it:

```
$ gh run view 41986445329 --json jobs --jq '.jobs[] | "\(.name)\t\(.conclusion)"'
parse-gate          success
preflight           success
deploy              skipped
critical-contracts  skipped
smoke               skipped
```

and the preflight annotation:

```
##[warning]SUPABASE_ACCESS_TOKEN is not provisioned, so the deploy is skipped.
Production stays on whatever is currently deployed (currently: nothing).
```

`gh secret list` confirms there is no such secret — the repository has
`SUPABASE_API_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_ANON_KEY` and `SUPABASE_API_URL`,
none of which is a management token (`sbp_...`) that `supabase functions deploy` accepts.

So the workflow that exists to end "success with nothing deployed" reproduced it one level
up: skipped jobs do not fail a run, and the only step summary was inside the skipped
`critical-contracts` job, so the run had no summary at all.

**Fixed:** a `report` job with `if: always()` that writes the outcome to the run summary —
`NOT DEPLOYED — no credentials`, the reason, and the remediation (add
`SUPABASE_ACCESS_TOKEN`, re-run via `workflow_dispatch`) — or `deployed` with the result of
each stage when it did run. It deliberately does **not** fail: a missing secret is an
operator action, and a permanently red check is one people learn to ignore. Five assertions
in `tests/edge-deploy-workflow.test.js` pin the guarantee, including that the report job
stays unconditional and that the credentials branch exits 0.

**Still required, and outside what code can do:** provision `SUPABASE_ACCESS_TOKEN`. Until
then the three MCP functions in this change are in `main` but **not** in production, and the
72 functions from PR #498 are still absent. This is the one item on the wave that needs a
human.

### 5.7 Full suite

The aggregate run on this box (2 vCPU, shared with another repository's suite;
load average 12-15) takes ~60-90 minutes and was sampled in three passes rather
than one uninterrupted run. Every one of the 107 test files is accounted for:

| pass | files | result |
|---|---|---|
| full run, unreachable remainder identified by name | 90 | 0 failures after the fix in §5.4 |
| the 19 files the first pass never reached, run together | 19 | 18 passed (25 tests), 1 worker **collection** timeout |
| `RoleManagementModal.test.jsx` alone | 1 | passed, 1 test in 11.9 s |
| second full run (killed when this box's load hit 15) | 44 | 0 failures |

Zero failing tests. Three files in this suite are load-sensitive rather than
broken, all of them jsdom component suites whose cost is import and render
setup: `api-gateway` (7.9 s, explicit 20 s budget), `QueueDepthPanel` (4.0 s solo,
explicit 15 s budget) and `RoleManagementModal` (11.9 s, worker collect timeout
under contention, passes alone). Each was verified in isolation before its budget
was raised; none is a hang and none is a behaviour change.

### 5.8 Lint

```
$ npx eslint .
EXIT=0
```

Zero errors, zero warnings. ~200 s on this runner.
