// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { scanSource, stripComments } from '../scripts/check-credentials.mjs';

/**
 * The real tree is the assertion that matters, but a scanner that can only go
 * green is not a gate — so each rule also gets a fixture that must trip it.
 */

describe('check-credentials: the shipped tree', () => {
  it('has no literal credential fallbacks in Edge Functions or client code', async () => {
    const { scanTree } = await import('../scripts/check-credentials.mjs');
    expect(scanTree()).toEqual([]);
  });
});

describe('check-credentials: rules', () => {
  it('flags a literal internal key used as a fallback', () => {
    const source = `const key = Deno.env.get("AXIM_INTERNAL_SERVICE_KEY") || "fallback_internal_key";`;
    expect(scanSource(source).map((v) => v.needle)).toEqual(['fallback_internal_key']);
    expect(scanSource(source)[0].line).toBe(1);
  });

  it('flags the service-role fallback literal in server code', () => {
    const source = `const expectedKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || 'test_internal_key';`;
    expect(scanSource(source).map((v) => v.needle)).toEqual(['test_internal_key']);
  });

  it('flags a service credential read from client code', () => {
    const source = `const key = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY;`;
    expect(scanSource(source, { scope: 'client' }).map((v) => v.needle)).toEqual([
      'VITE_SUPABASE_SERVICE_ROLE_KEY',
    ]);
  });

  it('does not allow a service credential in client code even without a fallback', () => {
    const source = `headers: { Authorization: \`Bearer \${import.meta.env.VITE_AXIM_SERVICE_KEY}\` }`;
    expect(scanSource(source, { scope: 'client' }).map((v) => v.needle)).toEqual([
      'VITE_AXIM_SERVICE_KEY',
    ]);
  });

  it('leaves server code alone when it only names the env var', () => {
    const source = `const key = Deno.env.get('AXIM_INTERNAL_SERVICE_KEY');\nif (!key) return forbidden();`;
    expect(scanSource(source)).toEqual([]);
  });

  it('ignores mentions inside comments, in both styles', () => {
    const source = [
      '// previously `|| "fallback_internal_key"` — do not reintroduce',
      '/* expectedKey = SUPABASE_SERVICE_ROLE_KEY || "test_internal_key" */',
      'const ok = 1;',
    ].join('\n');
    expect(scanSource(source)).toEqual([]);
  });

  it('keeps line numbers accurate after stripping comments', () => {
    // The variable is deliberately not named `key`: the repo's security-audit
    // workflow greps for `(key|token|secret|password) = "<literal>"` and a
    // fixture would trip it. The scanner under test reads positions, not names.
    const source = [
      '/*',
      '  a block comment',
      '*/',
      'const value = "test_internal_key";',
    ].join('\n');
    const violations = scanSource(source);
    expect(violations).toHaveLength(1);
    expect(violations[0].line).toBe(4);
  });

  it('does not mistake a similar identifier for the forbidden literal', () => {
    const source = `const fallbackInternalKeyName = 'fallback_internal_key_v2_suffix';`;
    expect(scanSource(source)).toEqual([]);
  });
});

describe('stripComments', () => {
  it('preserves length and string contents', () => {
    const source = `const url = 'http://x/y'; // trailing\nconst t = \`a\${1}b\`;`;
    const stripped = stripComments(source);
    expect(stripped).toHaveLength(source.length);
    expect(stripped).toContain("'http://x/y'");
    expect(stripped).not.toContain('trailing');
  });
});
