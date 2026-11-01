// @vitest-environment node
// esbuild refuses to load under jsdom: jsdom's TextEncoder returns a Uint8Array
// from another realm, and esbuild's startup invariant requires the global one.
/**
 * Regression gate for the Deno Edge Functions.
 *
 * Context: PR #492 merged `main` carrying a committed conflict marker inside
 * `supabase/functions/_shared/edgeAuth.ts`, which broke five production
 * functions. Nothing caught it because no workflow parses the Deno sources and
 * the `deno` binary is not installed anywhere in CI.
 *
 * These tests do two things:
 *   1. assert the real tree parses (the gate that would have failed the merge);
 *   2. assert the checker *detects* the defect class on purpose-built fixtures,
 *      so the gate cannot rot into a test that always passes.
 */
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { checkEdgeSyntax, checkFile, listDenoSources } from '../scripts/check-edge-syntax.mjs';

const REPO_ROOT = join(import.meta.dirname, '..');

describe('edge function parse gate — real tree', () => {
  it('parses every Deno source under supabase/functions', async () => {
    const { checked, failures } = await checkEdgeSyntax({ cwd: REPO_ROOT });

    // A sanity floor: if the walker silently found nothing, the gate is inert.
    expect(checked).toBeGreaterThan(50);
    expect(failures, `unparsable Deno sources:\n${JSON.stringify(failures, null, 2)}`).toEqual([]);
  }, 60_000);

  it('does not walk node_modules or dot directories', async () => {
    const files = await listDenoSources(join(REPO_ROOT, 'supabase/functions'));
    expect(files.some((file) => file.includes('node_modules'))).toBe(false);
    expect(files.every((file) => file.endsWith('.ts'))).toBe(true);
  });

  it('includes the shared auth module the conflict marker broke', async () => {
    const files = await listDenoSources(join(REPO_ROOT, 'supabase/functions'));
    expect(files).toContain(join(REPO_ROOT, 'supabase/functions/_shared/edgeAuth.ts'));
  });
});

describe('edge function parse gate — detection', () => {
  let fixtureRoot;

  beforeAll(async () => {
    fixtureRoot = await mkdtemp(join(tmpdir(), 'edge-syntax-'));
    const good = join(fixtureRoot, 'good');
    const conflict = join(fixtureRoot, 'conflict');
    const broken = join(fixtureRoot, 'broken');
    await mkdir(good, { recursive: true });
    await mkdir(conflict, { recursive: true });
    await mkdir(broken, { recursive: true });

    await writeFile(join(good, 'index.ts'), 'export const ok: string = "fine";\n');
    await writeFile(
      join(conflict, 'index.ts'),
      [
        'export function a() { return 1; }',
        '<<<<<<< HEAD',
        'export function b() { return 2; }',
        '=======',
        'export function b() { return 3; }',
        '>>>>>>> 19b39dd (feat(edge): versioned signatures)',
        '',
      ].join('\n'),
    );
    // The production failure mode seen in `audit-export/index.ts`: backticks
    // escaped into the source, so the module does not parse.
    await writeFile(join(broken, 'index.ts'), 'const name = \\`audit_export_${id}.csv\\`;\n');
  });

  afterAll(async () => {
    if (fixtureRoot) await rm(fixtureRoot, { recursive: true, force: true });
  });

  it('fails on a committed merge conflict marker', async () => {
    const failure = await checkFile(join(fixtureRoot, 'conflict', 'index.ts'));
    expect(failure).not.toBeNull();
    expect(failure.reason).toMatch(/conflict marker/i);
    expect(failure.reason).toMatch(/line\(s\) 2, 4, 6/);
  });

  it('fails on a file that does not parse', async () => {
    const failure = await checkFile(join(fixtureRoot, 'broken', 'index.ts'));
    expect(failure).not.toBeNull();
    expect(failure.reason).toMatch(/syntax error/i);
  });

  it('passes a valid file', async () => {
    await expect(checkFile(join(fixtureRoot, 'good', 'index.ts'))).resolves.toBeNull();
  });

  it('reports the offending file for the whole fixture tree', async () => {
    const { checked, failures, ok } = await checkEdgeSyntax({ root: fixtureRoot, cwd: fixtureRoot });

    expect(checked).toBe(3);
    expect(ok).toBe(false);
    expect(failures.map((failure) => failure.file).sort()).toEqual(['broken/index.ts', 'conflict/index.ts']);
  });
});
