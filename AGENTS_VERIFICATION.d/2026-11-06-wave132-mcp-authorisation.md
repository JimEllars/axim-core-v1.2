# Wave 132 — Per-tool authorisation and a quota for the MCP surface

**Branch:** `feat/core-wave-132-mcp-tool-authorisation`
**Base:** `38990fd` (main, post-PR #500)
**Date:** 2026-11-06
**Scope:** `supabase/functions/_shared/mcpAuthz.ts` (new),
`supabase/functions/_shared/mcpQuota.ts` (new), `_shared/mcpServer.ts`, the three MCP
entrypoints, `tests/mcp-authz.test.js` (new), `tests/mcp-quota.test.js` (new),
`tests/mcp-server.test.js`. No client, schema or workflow changes.

## Why this change exists

Wave 131 gave the MCP surface an implementation and one authorisation rule: is the caller
authenticated? That rule is necessary and not sufficient. `TOOL_DESCRIPTORS` exposed
`axim_dispatch_task`, which inserts into `public.hitl_audit_logs`, and the migration that
creates that table states the rule plainly:

```sql
-- supabase/migrations/20251101000000_create_hitl_audit_logs.sql:11-15
CREATE POLICY "Allow admins to view all hitl_audit_logs" ON public.hitl_audit_logs FOR SELECT
  USING ((SELECT role FROM public.users WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Allow admins to insert hitl_audit_logs" ON public.hitl_audit_logs FOR INSERT
  WITH CHECK ((SELECT role FROM public.users WHERE id = auth.uid()) = 'admin');
```

`_shared/mcpSupabase.ts` reaches that table with a client built from
`SUPABASE_SERVICE_ROLE_KEY`, and a service key bypasses RLS. So the only thing standing
between a freshly authenticated user and the operator approval queue was a tool function
that checked `actor.kind === 'user'` and nothing else. The table said "admins"; the surface
said "anyone with a token".

Separately, there was no limiter anywhere on the surface. The one limiter in the
repository, `cloudflare-workers/mcp-bridge/src/rateLimit.ts`, keys its in-memory Map on the
**raw bearer token** (`const identifier = token;`) and never evicts — so it stores every
operator's live credential for the lifetime of the isolate and grows without bound.

## 1. What was added

| file | lines | role |
|---|---|---|
| `_shared/mcpAuthz.ts` | 235 | policy per tool, role resolution, `tools/list` filtering |
| `_shared/mcpQuota.ts` | 219 | request and write quotas, bounded in-isolate store |
| `tests/mcp-authz.test.js` | 235 | 27 tests |
| `tests/mcp-quota.test.js` | 216 | 17 tests |

The policy table, with the schema fact each rule is taken from:

| tool | scope | basis |
|---|---|---|
| `core_health_check` | `mcp:read` | bounded probe, writes nothing |
| `telemetry_lookup` | `mcp:read` | `telemetry_events` has no RLS and no owner column |
| `axim_list_nodes` | `mcp:read` | `ecosystem_nodes` grants read to all authenticated (20270301000000) |
| `hitl_queue_status` | `mcp:admin` | `hitl_audit_logs` SELECT is admin-only (20251101000000) |
| `axim_dispatch_task` | `mcp:admin` | `hitl_audit_logs` INSERT is admin-only (20251101000000) |

`mcp:admin` requires a **user** caller whose `public.users.role` is `admin`. An internal
or relay caller is refused even though it holds the service key: it has no `public.users`
row, so a staged approval could not be attributed to anyone, and "internal" in this
codebase means "bypasses RLS" — a larger grant than the table was written to allow.

## 2. The failure modes this closes

1. **Privilege escalation.** Any verified user could stage an approval in the queue an
   admin reads. Now the tool that stages it answers with the rule the table states.
2. **Silent inventory leak.** `tools/list` and the `GET /mcp` discovery document returned
   the full tool registry to every caller. Both are now filtered through `visibleTools()`,
   so a non-admin is not handed a list of what to try next.
3. **Default-open.** A tool added to `TOOL_DESCRIPTORS` without a policy would previously
   have been callable. `buildRpcContext().call()` now refuses a registered-but-unpolicied
   tool, `policyFor()` uses `hasOwnProperty` so `constructor` cannot resolve through the
   prototype, and two tests assert registry ↔ policy agreement in both directions.
4. **Fail-open role resolution.** `resolveActorRole()` returns `null` for a missing row,
   an unrecognised value, or a failed query, and `null` satisfies no admin-scope tool. A
   database fault denies a write; it does not promote a caller.
5. **Credential-keyed rate limiting.** Buckets are keyed `user:<uuid>` /
   `internal:<via>`. The bridge's approach is not copied, and `tests/mcp-quota.test.js`
   asserts the subject never contains bearer material.
6. **Unbounded limiter memory.** `MemoryQuotaStore` is bounded (`maxKeys`, default 5000),
   sweeps expired windows first, then drops the oldest. Four tests cover the bound.

## 3. Wiring

`buildRpcContext()` gained two optional parameters and enforces both rules itself, so a
tool cannot be written that skips them:

```ts
// supabase/functions/_shared/mcpServer.ts:116-170
const actor = params.actor ?? actorFromCaller(caller);   // role null => read-only
const quota = params.quota === null ? null : (params.quota ?? {});
...
list: () => visibleTools(listTools(), actor),
call: async (name, args) => {
  const policy = policyFor(name);
  if (!policy && registered.has(name)) { /* refused: no policy */ }
  if (policy) {
    const decision = decideToolCall(name, actor);
    if (!decision.ok) { /* isError: true, names the rule */ }
    if (policy.mutating && quota) { /* 20 writes/min per subject */ }
  }
  ...
```

Each entrypoint resolves the actor once per request and charges the request quota once:

| file | line range | change |
|---|---|---|
| `mcp-router/index.ts` | 16-21, 29-31, 46-54, 83-113 | imports, `json()` headers param, quota charge, actor resolution, filtered discovery document |
| `mcp-sse/index.ts` | 32-38, 48-56, 129-138, 147 | imports, `json()` headers param, quota charge, actor resolution, `actor` into `buildRpcContext` |
| `mcp-message/index.ts` | 24-30, 83-92, 111 | imports, quota charge, actor resolution, `actor` into `buildRpcContext` |

The quota is charged **after** authentication, so only a caller with an identity is ever
counted, and 429s carry `Retry-After`, `X-RateLimit-Limit` and `X-RateLimit-Remaining`.

## 4. Verification appendix

### 4.1 The gate, proven in files that import the module under test

| claim | proving test | file |
|---|---|---|
| an internal caller cannot use an admin tool | `refuses an internal caller even though it holds the service key` | `tests/mcp-authz.test.js` |
| a non-admin user cannot stage an approval | `refuses a user whose role is "user"` | `tests/mcp-authz.test.js` |
| a failed role lookup denies rather than promotes | `returns null when the lookup fails, so a database fault denies a write` | `tests/mcp-authz.test.js` |
| an unpolicied tool is refused, not executed | `refuses by default and says why` | `tests/mcp-authz.test.js` |
| the registry and the policy table cannot drift apart | `declares a policy for every registered tool` + `declares no policy for a tool that is not registered` | `tests/mcp-authz.test.js` |
| `constructor`/`__proto__` do not resolve as policies | `does not resolve a policy through the object prototype` | `tests/mcp-authz.test.js` |
| the discovery surface hides what the caller cannot call | `hides the admin tools from a non-admin` | `tests/mcp-server.test.js` |
| an actor-less context is read-only, not admin | `defaults an actor-less context to read-only rather than to admin` | `tests/mcp-server.test.js` |
| the write budget is charged on writes only | `charges the write quota only on a mutating tool…` | `tests/mcp-server.test.js` |
| the budget denies at the boundary with a usable delay | `allows exactly \`limit\` calls, then denies`, `reports a retry delay that points at the end of the window` | `tests/mcp-quota.test.js` |
| the limiter cannot be turned into a memory leak | `never exceeds \`maxKeys\``, `sweeps expired buckets before dropping live ones` | `tests/mcp-quota.test.js` |
| buckets are keyed by subject, not credential | `keys an internal caller by how it authenticated, never by the key itself` | `tests/mcp-quota.test.js` |
| role lookup is one indexed read on the right table and columns | `reads public.users by primary key, one row, two columns` | `tests/mcp-authz.test.js` |

Before this wave, `tests/mcp-server.test.js` asserted that an internal caller is refused by
`axim_dispatch_task`'s own `admin_id` check. That check still exists and is still proven in
`tests/mcp-tools.test.js` (`refuses an internal caller, because admin_id references
auth.users`); the server-level test now asserts the policy gate that runs **before** it.

### 4.2 Targeted run, verbatim

```
$ node ./node_modules/vitest/vitest.mjs run \
    tests/mcp-authz.test.js tests/mcp-quota.test.js tests/mcp-server.test.js \
    tests/mcp-tools.test.js --maxWorkers=1 --reporter=dot

 RUN  v1.6.1 /workspace/review/axim-core-v1.2

 ✓ tests/mcp-tools.test.js  (17 tests) 240ms
 ✓ tests/mcp-server.test.js  (18 tests) 797ms
 ✓ tests/mcp-authz.test.js  (27 tests) 877ms
 ✓ tests/mcp-quota.test.js  (17 tests) 641ms

 Test Files  4 passed (4)
      Tests  79 passed (79)
```

Re-run after the `MemoryQuotaStore` refactor in §4.5:

```
 ✓ tests/mcp-server.test.js  (18 tests) 1362ms
 ✓ tests/mcp-authz.test.js  (27 tests) 1041ms
 ✓ tests/mcp-quota.test.js  (17 tests) 721ms

 Test Files  3 passed (3)
      Tests  62 passed (62)
```

### 4.3 Syntax, credentials, worker bundle and smoke gates

```
$ npm run check:edge
Edge syntax OK: parsed 113 Deno source(s) under supabase/functions.

$ npm run check:creds
check:creds — no literal credential fallbacks in server or client code.

$ node scripts/smoke-test-functions.js
Mock smoke test execution successful.

$ cd cloudflare-workers && npx esbuild src/index.js --bundle --format=esm --platform=neutral
  ../../../../tmp/worker-bundle.js  11.2kb
⚡ Done in 162ms

$ cd cloudflare-workers && npx wrangler deploy --dry-run -c wrangler.toml
Total Upload: 32.80 KiB / gzip: 8.10 KiB
Your Worker has access to the following bindings:
  env.SUPABASE_URL      Environment Variable
  env.ALLOWED_ORIGINS   Environment Variable
--dry-run: exiting now.

$ npm run lint
> eslint .
EXIT=0        # 9m50s wall, 0 errors, 0 warnings
```

`check:edge` counted 111 sources before this wave and 113 after, which is the two new
modules — it parses, so the Deno sources are not broken by the added imports. `deno check`
still cannot run here; Deno is not installed in this workspace, which is the same
limitation the Wave 127 appendix records.

### 4.4 Whole-suite baseline (116 test files, 0 failures)

A single `vitest run` does not complete on this box. It was started clean and reached 32 of
116 files before the runner was killed with no summary written — load average 15, a
`rclone` workspace sync in the same cgroup, 3 GB RAM, 2 vCPU. Wave 131's appendix records
the same environment forcing a multi-pass approach, so this wave accounts for every file
the same way rather than claiming a run that did not finish.

| pass | files | result |
|---|---|---|
| full run, before it was killed | 32 | 31 passed; `WorkflowBuilder.test.jsx` 8/9 with `should load workflows on mount` hitting Vitest's 5 s default **inside a file that took 184 s** on this box |
| `WorkflowBuilder.test.jsx` alone | 1 | **9/9 passed in 4.71 s** — contention, not a regression |
| batches 1–3 (every `src/**` file the full run never reached) | 72 | 70 files passed, 2 skipped files, **190 tests passed**, 0 failed |
| batch 4 (`tests/{command-hub,e2e-workflow,edge-worker,metrics-grid,onyx-bridge}` + this wave's two new suites) | 7 | **53 passed**, 0 failed |
| batch 5 (`cloudflare-workers/tests/integration`, four `supabase/functions/**/__tests__`) | 5 | **8 passed**, 0 failed |

Every one of the 116 collected test files is accounted for and none fails. The
`WorkflowBuilder` timeout is the fourth instance of the load-sensitive class Wave 129 and
Wave 131 documented (`api-gateway`, `QueueDepthPanel`, `RoleManagementModal` were the
others); it was proven in isolation before being recorded as such, and no timeout budget
was changed in this wave.

### 4.5 One defect found in this wave's own first draft

The first `MemoryQuotaStore.consume()` only wrote the bucket back when it created a new
window. Eviction order therefore tracked *first sighting* rather than last use, so a hot
bucket could be evicted while a stale one survived — and the class comment claimed
otherwise. `consume()` now re-stores on every call (delete-then-set, which also means
re-storing an existing key cannot trigger an eviction, because the size has already
dropped by one before the bound is checked). The quota tests were re-run after the change;
`drops the oldest window when everything is live` pins the behaviour.

## 5. Stated limitations

- **The quota is per isolate.** The real ceiling is `limit × live isolates`. It stops a
  retrying client or a model looping `tools/call`; it is not a defence against a
  distributed flood. That belongs in Cloudflare rate-limiting rules on `/mcp`, `/sse` and
  `/message`, which is an operator action, and a durable counter needs a table plus a
  round trip per request. Both are recorded in `Continued Development Plan.md`.
- **Fixed windows.** A caller can spend a full window either side of a boundary. Said at
  the top of the module rather than left to be discovered.
- **One extra read per user request.** `resolveMcpActor()` costs one primary-key read on
  `public.users`. An internal caller costs none. If MCP traffic ever makes that visible,
  the JWT already carries the role claim via `public.custom_access_token_hook`
  (20270801000000) and could be trusted instead — deliberately not done here, because the
  hook has to be installed in the project's auth settings for the claim to exist, and
  `public.users.role` is the value `is_admin()` uses.
- **`hitl_queue_status` is now admin-only**, which is stricter than it was and matches the
  SELECT policy on the table. Nothing calls the MCP surface in production yet (all Edge
  Functions still answer `{"code":"NOT_FOUND"}` — see the Wave 131 appendix §6), so this
  narrows a surface that has no consumers rather than breaking one.
