#!/usr/bin/env node
/**
 * Parse gate for the Deno Edge Functions in `supabase/functions/`.
 *
 * Why this exists: PR #492 merged main with a committed conflict marker inside
 * `supabase/functions/_shared/edgeAuth.ts`. Every parser rejects that file, so
 * five production functions (`telemetry-ingress`, `generate-embedding`,
 * `memory-retrieval`, `onyx-sentinel`, `onyx-ui-stream`) could not be deployed.
 * It still reached `main` because nothing in CI looked at the Deno sources:
 * the vitest include pattern is `*.{test,spec}.?(c|m)[jt]s?(x)`, and the `deno`
 * binary is not part of any workflow.
 *
 * This gate parses every Deno source with esbuild (already a devDependency), so
 * it runs under plain `node`/`vitest` with no Deno toolchain and no network.
 * It catches conflict markers, unbalanced braces and invalid TypeScript — the
 * class of defect that a text-only review misses.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { transform } from 'esbuild';

/** `<<<<<<< `, `=======` and `>>>>>>> ` at the start of a line. */
const CONFLICT_MARKER = /^(?:<{7}(?: .*)?|={7}|>{7}(?: .*)?)$/gm;

export const DEFAULT_EDGE_ROOT = 'supabase/functions';

/** Every `.ts` file under `root`, excluding `node_modules`. */
export async function listDenoSources(root) {
  const found = [];
  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.ts')) {
        found.push(full);
      }
    }
  }
  await walk(root);
  return found.sort();
}

/**
 * Parse one file. Returns null when it is fine, or a `{ file, reason }` object.
 * Conflict markers are reported separately from parser errors because the two
 * need different fixes and a marker makes the parser error noise.
 */
export async function checkFile(file) {
  const source = await readFile(file, 'utf8');

  const markers = [...source.matchAll(CONFLICT_MARKER)];
  if (markers.length > 0) {
    const lines = markers.map((match) => source.slice(0, match.index).split('\n').length);
    return {
      file,
      reason: `committed merge conflict marker(s) at line(s) ${lines.join(', ')}`,
    };
  }

  try {
    await transform(source, { loader: 'ts', sourcefile: file });
    return null;
  } catch (error) {
    const first = error?.errors?.[0] ?? error;
    const location = first?.location ? `${first.location.line}: ` : '';
    return { file, reason: `${location}${first?.text ?? String(first.message ?? first)}` };
  }
}

/**
 * Parse every Deno source under `root` (resolved against `cwd`).
 * Never throws on a bad file — the failure list is the result.
 */
export async function checkEdgeSyntax({ root = DEFAULT_EDGE_ROOT, cwd = process.cwd() } = {}) {
  const absoluteRoot = resolve(cwd, root);
  const files = await listDenoSources(absoluteRoot);
  const failures = [];

  for (const file of files) {
    const failure = await checkFile(file);
    if (failure) failures.push({ ...failure, file: relative(cwd, failure.file) });
  }

  return { checked: files.length, failures, ok: failures.length === 0 };
}

async function main() {
  const { checked, failures } = await checkEdgeSyntax();
  if (failures.length === 0) {
    console.log(`Edge syntax OK: parsed ${checked} Deno source(s) under ${DEFAULT_EDGE_ROOT}.`);
    return 0;
  }

  console.error(`Edge syntax FAILED: ${failures.length} of ${checked} file(s) do not parse.`);
  for (const failure of failures) {
    console.error(`  ${failure.file}: ${failure.reason}`);
  }
  return 1;
}

const invokedDirectly = process.argv[1] && import.meta.url === `file://${resolve(process.argv[1])}`;
if (invokedDirectly) {
  process.exit(await main());
}
