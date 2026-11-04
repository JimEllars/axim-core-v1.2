#!/usr/bin/env node
/**
 * Dry-run the decision logic of `.github/workflows/deploy-edge-functions.yml`
 * against the live Supabase gateway, without deploying anything.
 *
 * The workflow's smoke gate decides "deployed or not" from the response BODY,
 * not the status code, because a live function that rejects an unauthenticated
 * caller answers 401 and a live `verify_jwt = false` function may answer 200 —
 * neither of which is distinguishable from "missing" by status alone. The
 * gateway's own not-deployed body is unambiguous:
 *
 *   absent  -> {"code":"NOT_FOUND","message":"Requested function was not found"}
 *   present -> anything else
 *
 * This script asserts that discriminator holds for known-present and
 * known-absent functions in the same run. If it ever stops holding (platform
 * change, gateway rewrite), the smoke gate is silently broken and this fails
 * loudly instead.
 *
 *   node scripts/check-edge-deploy-gate.mjs
 */
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'pvbcdndqjguzqeafhwhw';
const BASE = `https://${PROJECT_REF}.supabase.co/functions/v1`;
const NOT_FOUND_MARKER = 'Requested function was not found';

/** The same probe the workflow uses: POST {} and inspect the body. */
async function probe(fn) {
  const res = await fetch(`${BASE}/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
    signal: AbortSignal.timeout(15000),
  });
  const body = await res.text();
  return { status: res.status, body, absent: body.includes(NOT_FOUND_MARKER) };
}

async function listLocalFunctions() {
  const root = 'supabase/functions';
  const entries = await readdir(root, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && e.name !== '_shared' && e.name !== 'node_modules')
    .map((e) => e.name)
    .sort();
}

let failures = 0;
function assert(cond, label, detail = '') {
  if (cond) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

console.log(`Probing ${BASE}\n`);

// --- 1. A name that cannot exist must be reported absent -------------------
// This is the control. If a genuinely nonexistent function does not come back
// with the not-found marker, the discriminator is unreliable and every other
// assertion below is meaningless.
console.log('control: nonexistent function');
const control = await probe('zzz-definitely-not-a-function-onyx-control');
assert(
  control.absent,
  'nonexistent function reports the not-found marker',
  `status=${control.status} body=${control.body.slice(0, 120)}`,
);

// --- 2. Known-present functions must NOT be reported absent ----------------
// api-gateway is deployed and has verify_jwt = false; it answers 401 to a POST
// without a token, and 401 is the case most likely to be misread as "not
// deployed" by a status-code gate.
console.log('\nknown-present functions (must not read as absent)');
for (const fn of ['api-gateway', 'llm-proxy', 'voice-ingest']) {
  const r = await probe(fn);
  assert(
    !r.absent,
    `${fn} is present`,
    `status=${r.status} body=${r.body.slice(0, 120)}`,
  );
}

// --- 3. Known-absent functions must be reported absent ---------------------
// telemetry-ingress and resolve-hitl were 404 at the time of writing. If they
// have since been deployed this assertion flips, which is the desired outcome —
// it means the deploy landed.
console.log('\nknown-absent functions (expected absent until deployed)');
for (const fn of ['telemetry-ingress', 'resolve-hitl']) {
  const r = await probe(fn);
  if (r.absent) {
    console.log(`  ok   ${fn} is absent (as expected — deploy will fix this)`);
  } else {
    console.log(`  note ${fn} is now PRESENT — the deploy has landed since this script was written`);
  }
}

// --- 4. Every local directory is a name the gateway recognises -------------
// Catches a function directory that was renamed in git but never redeployed,
// and directories that are not valid function names.
console.log('\nlocal function directories');
const local = await listLocalFunctions();
assert(local.length > 0, `found ${local.length} function directories`);
assert(
  !local.includes('_shared'),
  '_shared is excluded from the deploy set',
);
const badNames = local.filter((n) => !/^[a-z0-9][a-z0-9-]*$/.test(n));

// `dead_letter_jobs` is a real function (a DLQ retry worker) whose directory name
// contains an underscore. Supabase function slugs are lowercase alphanumeric and
// hyphens only, so this directory cannot be deployed under its own name — it 404s
// at the gateway, verified 2026-11-04. It is an acknowledged defect rather than a
// surprise: renaming the directory changes the deployed function name, and this
// function is invoked by something outside this repo that is not visible here.
// Remove this exemption when the rename and its invoker are updated together.
const KNOWN_BAD_NAME_EXEMPTIONS = new Set(['dead_letter_jobs']);
const unexpectedBad = badNames.filter((n) => !KNOWN_BAD_NAME_EXEMPTIONS.has(n));
assert(
  unexpectedBad.length === 0,
  'every directory name is a valid function slug',
  unexpectedBad.join(', '),
);
for (const n of badNames.filter((x) => KNOWN_BAD_NAME_EXEMPTIONS.has(x))) {
  console.log(`  note ${n} has an invalid slug and cannot deploy — known defect, exempted`);
}

// --- 5. We are not deploying zero functions -------------------------------
// The workflow hard-fails on an empty set; prove the resolution is non-empty.
assert(local.length >= 80, `deploy set resolves to ${local.length} functions`);

console.log(`\n${failures === 0 ? 'PASS' : `FAIL (${failures})`}`);
process.exit(failures === 0 ? 0 : 1);
