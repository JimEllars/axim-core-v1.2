# Verification Appendix — Wave 127: un-unparsable Edge Functions and the gate that keeps them that way

**Branch:** `feat/core-wave-127-robotics-execution` (branch name predates the scope; see §7)
**Base:** `4dc7151` (`main`, merge of PR #492)
**Date:** 2026-11-01
**Scope:** `supabase/functions/`, `scripts/`, `tests/`, one workflow, `package.json`, `vitest.setup.jsx`

---

## 1. Why this cycle did remediation instead of the planned wave

The standing instruction for each 4-hour cycle is "zero progress on a broken build": if the
audit finds a failure, all capacity goes to restoring the baseline. The audit found that
`main` did not parse. Four of the 95 Deno Edge Function sources were syntactically invalid,
so `supabase functions deploy` could not succeed for any of them, and five *deployed*
functions depend on the broken shared module.

This appendix records the four fixes, the gate that would have caught them, and the test
that proves the worst one is actually repaired rather than merely quiet.

---

## 2. Finding: a committed merge conflict marker reached `main`

**File:** `supabase/functions/_shared/edgeAuth.ts`, lines 125–272.
**Introduced by:** merge commit `4dc7151` (PR #492, *versioned signatures with a date-keyed
dual-accept window*).

The signature branch had already merged `main` into itself and committed the markers; the
final merge then took that poisoned version wholesale. Proof that both parents differ:

```
$ git show 4dc7151^1:supabase/functions/_shared/edgeAuth.ts | grep -cE '^(<<<<<<<|=======|>>>>>>>)'
0                      # main before the merge: clean, 148 lines
$ git show 4dc7151^2:supabase/functions/_shared/edgeAuth.ts | grep -nE '^(<<<<<<<|=======|>>>>>>>)'
125:<<<<<<< HEAD
149:=======
271:>>>>>>> 19b39dd (feat(edge): versioned signatures ...)
```

**Impact.** Five production functions import this module, so none of them could be parsed
or deployed:

| Function | Import site |
|---|---|
| `telemetry-ingress` | `_shared/edgeAuth.ts` |
| `generate-embedding` | `_shared/edgeAuth.ts` |
| `memory-retrieval` | `_shared/edgeAuth.ts` |
| `onyx-sentinel` | `_shared/edgeAuth.ts` |
| `onyx-ui-stream` | `_shared/edgeAuth.ts` |

**Proving failure, before the fix** — two independent parsers, exact transcript:

```
$ npx esbuild supabase/functions/_shared/edgeAuth.ts --outfile=/tmp/ea.js
✘ [ERROR] Unexpected "<<"
    supabase/functions/_shared/edgeAuth.ts:125:0:
      125 │ <<<<<<< HEAD
          ╵ ~~

$ npx tsc --noEmit --skipLibCheck --target es2022 --module esnext \
      --moduleResolution bundler supabase/functions/_shared/edgeAuth.ts
supabase/functions/_shared/edgeAuth.ts(125,1): error TS1185: Merge conflict marker encountered.
supabase/functions/_shared/edgeAuth.ts(149,1): error TS1185: Merge conflict marker encountered.
supabase/functions/_shared/edgeAuth.ts(271,1): error TS1185: Merge conflict marker encountered.
```

**Fix.** Union resolution, because both sides are load-bearing:

* the `HEAD` side is the tenancy helper `claimFromToken()` added by #491 (decodes a claim
  from an **already-verified** JWT so a forged token cannot supply its own tenant);
* the other side is the versioned-signature block added by #492 (`verifySignedRequest`,
  `SIGNATURE_V2`, `SIGNATURE_MAX_SKEW_SECONDS`, `DEFAULT_LEGACY_SUNSET`).

Neither was dropped. The only edits were the three marker lines and the one closing brace
that the `claimFromToken` function body needed. `edgeAuth.ts` now exports, in order:
`timingSafeEqual`, `isInternalServiceCall`, `hasBearerToken`, `bearerToken`,
`resolveCaller`, `keysFromEnv`, `claimFromToken`, `SIGNATURE_V2`,
`SIGNATURE_MAX_SKEW_SECONDS`, `DEFAULT_LEGACY_SUNSET`, `verifySignedRequest`.

**Proving success:**

```
$ npx esbuild supabase/functions/_shared/edgeAuth.ts --outfile=/tmp/ea.js
  /tmp/ea.js  5.8kb
⚡ Done in 159ms

$ npx tsc --noEmit --skipLibCheck --target es2022 --module esnext \
      --moduleResolution bundler supabase/functions/_shared/edgeAuth.ts
(no output, exit 0)
```

**Behavioural proof:** `tests/edge-auth.test.js` (14 tests, `// @vitest-environment node`)
imports the real module and exercises **both halves** — v2 signatures bound to the
timestamp, the 5-minute replay window, legacy acceptance before the sunset and rejection
after it, fail-closed with no secret, and `claimFromToken` reading a nested tenant claim.
Before the fix this file could not load at all: the module failed to parse, so no
behavioural assertion was reachable.

---

## 3. Findings: three more Deno sources that did not parse

Found by the new gate on its first run against the tree (`Edge syntax FAILED: 3 of 95`).
None of these are merge artefacts; they are ordinary authoring defects that no check
looked at.

| File | Defect | Fix |
|---|---|---|
| `supabase/functions/audit-export/index.ts:76,86` | Backticks escaped into the source (`\`audit_export_…\``), so the file is not valid TS | Real template literals |
| `supabase/functions/gateway-heartbeat/index.ts:35` | `import { createClient }` placed **inside** the `serve()` handler, after executable statements | Import hoisted to the module head |
| `supabase/functions/stream-webhook/index.ts:39,56` | Postgres casts written in TypeScript: `update({ value: 'true'::jsonb })` | `value: true` / `value: false` |

For `stream-webhook` the column is `system_status.value JSONB NOT NULL`
(`supabase/migrations/20261220000000_podcast_poller_cron.sql`), and the migration seeds
`'false'::jsonb`, so a JSON boolean is the matching representation. Nothing reads `is_live`
yet, so there is no consumer to keep compatible.

Proving failure (first run of the gate, before these three edits):

```
$ node scripts/check-edge-syntax.mjs
Edge syntax FAILED: 3 of 95 file(s) do not parse.
  supabase/functions/audit-export/index.ts: 76: Syntax error "`"
  supabase/functions/gateway-heartbeat/index.ts: 35: Unexpected "{"
  supabase/functions/stream-webhook/index.ts: 39: Expected "}" but found ":"
```

Proving success:

```
$ node scripts/check-edge-syntax.mjs
Edge syntax OK: parsed 95 Deno source(s) under supabase/functions.
```

---

## 3b. Finding: a red test that had been red on `main`

**File:** `src/services/onyxAI/commands/__tests__/network.test.js:20`
**Introduced by:** nothing in this branch — it fails identically on a pristine
`origin/main` worktree (verified, see below).

The suite asserts that a device last seen one day ago renders as `1 day ago`, using
`Date.now() - 86400000`. Under date-fns 4.4.0 that renders `about 23 hours ago`:

```
$ node --input-type=module -e "import {formatDistanceToNow} from 'date-fns'; ..."
86340000 => about 23 hours
86400000 => about 23 hours     # exactly 24h
86400001 => about 23 hours
93600000 => 1 day              # 26h
```

date-fns v4 floors the hour count in its `xHours` branch, so exactly 24 hours never
produces `1 day`. The production formatter is fine; the assertion named a string that
production cannot emit, and the test has been failing on `main` ever since.

**Fix:** the fixture now uses 26 hours, with a comment recording why, so the assertion
tests the real boundary instead of a value that cannot occur.

```
$ NODE_ENV=test npx vitest run --no-coverage src/services/onyxAI/commands/__tests__/network.test.js
      Tests  3 passed (3)
```

**Proof it pre-dated this branch** — same file, unmodified `origin/main` worktree:

```
$ git -C /tmp/wt-main-pristine log -1 --oneline
4dc7151 Merge PR #492: versioned signatures with a date-keyed dual-accept window
$ NODE_ENV=test npx vitest run --no-coverage src/services/onyxAI/commands/__tests__/network.test.js
+ ... (Status: offline, Last Seen: about 23 hours ago)
      Tests  1 failed | 2 passed (3)
```

---

## 4. The gate: `scripts/check-edge-syntax.mjs`

**Why nothing caught this.** Two independent gaps, both real:

1. No workflow parses `supabase/functions/`. The PR-triggered workflow is
   `verify-smoke-tests.yml`; it runs a hand-written smoke script, `npm run build` and the
   worker dry-run. None of those open a Deno file.
2. `deno` is not installed in CI at all, so `deno check` has never run. It is not installed
   in this workspace either — recorded as a limitation in §6.

**What it does.** Walks `supabase/functions/` for `.ts` files, reports committed conflict
markers with line numbers, then parses every file with `esbuild.transform()` — esbuild is
already a devDependency, so the gate runs under plain `node` and `vitest` with no Deno
toolchain, no network and no Docker.

**Wiring.**

* `package.json`: new script `"check:edge": "node scripts/check-edge-syntax.mjs"`.
* `.github/workflows/verify-smoke-tests.yml`: `npm run check:edge` runs before the smoke
  tests, on every `pull_request` and every push to `main`.

**Detection is proven, not assumed.** `tests/edge-syntax.test.js` (7 tests) asserts the real
tree parses *and* that the checker fails on purpose-built fixtures: a conflict-marked file
(reports lines 2, 4, 6), a file with escaped backticks, and a clean file that must pass.
A gate that only ever asserts "green" would rot; this one is shown to be able to go red.

```
$ NODE_ENV=test npx vitest run --no-coverage tests/edge-syntax.test.js
 ✓ tests/edge-syntax.test.js  (7 tests) 10162ms
      Tests  7 passed (7)
```

**Supporting change:** `vitest.setup.jsx` now guards its `window.matchMedia` mock with
`typeof window !== 'undefined'`. The setup file was global and assumed jsdom, which made a
`// @vitest-environment node` suite impossible; esbuild refuses to load under jsdom because
jsdom's `TextEncoder` returns a `Uint8Array` from another realm.

---

## 5. Full verification sweep (post-change)

| Check | Command | Result |
|---|---|---|
| Lint | `npm run lint` | 0 errors, 7 warnings — all pre-existing `react-refresh/only-export-components` in `src/contexts/*.jsx`, unrelated to this change |
| Edge parse gate | `npm run check:edge` | 95 files parsed, 0 failures |
| Edge auth behaviour | `npx vitest run tests/edge-auth.test.js` | 14 passed |
| Gate detection | `npx vitest run tests/edge-syntax.test.js` | 7 passed |
| Worker bundle | `cd cloudflare-workers && npx wrangler deploy --dry-run -c wrangler.toml` | `Total Upload: 30.71 KiB / gzip: 7.28 KiB`, dry-run OK |
| Vitest suite | `npx vitest run --no-coverage` | see §6.1 — 95 files collected sequentially, 1 pre-existing failure found and fixed (§3b) |

`NODE_ENV` must be `test` for the suite: this workspace exports `NODE_ENV=production`, which
makes React's `act()` throw "not supported in production builds" across every component
test. That is an environment artefact, not a repo defect, but it will waste an hour for
whoever hits it next, so it is recorded here.

---

## 6. Environment limitations found during the audit

These are recorded rather than worked around, because each one hides a real check:

1. **No `deno` binary** in this workspace, so Phase 1.5's `deno check` could not be run and
   the three existing Deno test files (`_shared/edgeAuth_test.ts`,
   `_shared/signature_test.ts`, `_shared/tenancy_test.ts`) cannot execute. Follow-up:
   install Deno in CI (`denoland/setup-deno`) and run them; until then
   `tests/edge-auth.test.js` is the only executed proof of that module.
2. **The aggregate vitest run stalls on this host.** Two attempts at a single
   `vitest run` (default pool, and `--maxWorkers=2`) both stopped making progress around
   file 27–50, leaving one worker alive at ~8% CPU. The machine has 2 cores and a load
   average above 6 with other worktrees building; every one of those files passes
   individually. The baseline was therefore collected file by file (§6.1) rather than
   claimed as a single green run. Follow-up: reproduce on a 4-core runner before adding
   `npm run test` to CI — a suite that can stall is not yet a gate.
3. **`NODE_ENV=production` in the ambient shell** (see §5).

### 6.1 Per-file suite baseline

A single `vitest run` cannot complete on this host (§6, item 2), so the suite was collected
one file at a time in a single pass, `NODE_ENV=test npx vitest run --no-coverage <file>`.

```
Test Files  1 failed | 92 passed | 2 skipped (95)
     Tests  1 failed | 463 passed | 9 skipped (473)
  Duration  1801.35s
```

* The single failure is `src/services/onyxAI/commands/__tests__/network.test.js`, which also
  fails on a pristine `origin/main` — diagnosed and fixed in §3b. Re-run after the fix:

  ```
  $ NODE_ENV=test npx vitest run --no-coverage src/services/onyxAI/commands/__tests__/network.test.js
        Tests  3 passed (3)
  ```

* The two skipped files are `src/components/admin/EcosystemRegistry.test.jsx` (3 tests) and
  `src/services/onyxAI/commands/__tests__/workflow.test.js` (4 tests), plus 2 individually
  skipped tests in `emailCommands.test.js` — all `describe.skip`/`it.skip` already present on
  `main`, none introduced here.

* `tests/edge-syntax.test.js` and `tests/edge-auth.test.js` were run separately (7 and 14
  tests, both green) because they were added after this pass started; both are included in
  the aggregate pattern and will be collected by any future full run.

---

## 7. Ingress health (Phase 1.6) — two documented hostnames are not serving the Core

Read-only probes from this host, 2026-11-01:

| Endpoint | Result | Reading |
|---|---|---|
| `https://axim-core.jrellars.workers.dev/health` | `200 {"ok":true}` | Worker is up. Note the body is `{"ok":true}`, while `cloudflare-workers/src/index.js` returns `{"status":"UP","timestamp":…}` — the deployed worker is **not** the tree in `main`. |
| `https://axim-core.jrellars.workers.dev/api/v1/robotics/sim` | `404 {"error":"not_found"}` | Confirms `robotics-sim` does not exist, as the development plan states. |
| `https://axim-core.jrellars.workers.dev/mcp` | `404 {"error":"not_found"}` | Same for the MCP functions (`mcp-router`, `mcp-sse`, `mcp-message`). |
| `https://api.axim.us.com/health` | `302 → /404.html`, `host-header: c2hhcmVkLmx1ZWhvc3QuY29t` (base64: `shared.bluehost.com`) | The documented API ingress is being served by **Bluehost shared hosting**, not Cloudflare. |
| `https://core.axim.us.com/health` | no DNS record (`getent hosts` → nothing) | The second documented ingress does not resolve. |

The last two need DNS/zone changes on the operator's side; nothing in the repository can fix
them, and they were not touched. Flagged for James in the handoff.

---

## 8. Branch name vs. scope

The branch was cut as `feat/core-wave-127-robotics-execution`, planning to build the three
robotics Edge Functions the worker already routes to. The audit changed the plan: the build
was broken, and the cardinal rule puts remediation first. The robotics functions remain the
top of the plan; the branch name is now inaccurate and is called out here rather than
renamed mid-review.

---

## 9. Loose ends observed, not fixed

* **`feat/core-wave-125-workflow-persistence-and-ingress`** and
  **`feat/core-wave-126-node-inspector-and-execution-history`** are pushed to `origin` with
  **no pull request**. They are 14 commits behind `main`, and both predate #491/#492 — a
  naive merge would overwrite the tenancy `claimFromToken()` and the versioned-signature
  block that this appendix just restored. They need a rebase and a PR, not a merge.
* `trigger-workflow` still has no caller authentication on `main`, and its action nodes are
  still `// Mock execution logic for now`. Unchanged by this branch.
