#!/usr/bin/env node
/**
 * Fails when a credential fallback reappears in shipped code.
 *
 * Every one of these was a real hole:
 *
 *   - `Deno.env.get("AXIM_INTERNAL_SERVICE_KEY") || "fallback_internal_key"`
 *     turns a missing env var into a working, publicly guessable credential.
 *     `universal-dispatcher` accepted exactly that literal, and the same literal
 *     was compiled into the browser bundle, so the pair authenticated each other.
 *   - `SUPABASE_SERVICE_ROLE_KEY || 'test_internal_key'` did the same for
 *     `omnichannel-publisher`, `ground-game-assign` and `memory-retrieval`.
 *   - `VITE_SUPABASE_SERVICE_ROLE_KEY` in client code is worse than a fallback:
 *     a `VITE_*` value is inlined into the public JS bundle, so the dashboard
 *     would ship a full-database credential to every visitor.
 *
 * A missing key must fail closed. This gate is deliberately textual and
 * dependency-free so it runs in the existing Node-only CI next to check:edge.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Literals that must never appear in executable code, in either tree. */
const LITERAL_CREDENTIALS = [
  'fallback_internal_key',
  'test_internal_key',
  'default_internal_key_fallback',
  'default-auth-token',
];

/** Environment variables that must never be read from client code. */
const CLIENT_ONLY_FORBIDDEN = [
  'VITE_SUPABASE_SERVICE_ROLE_KEY',
  'VITE_AXIM_SERVICE_KEY',
  'VITE_AXIM_INTERNAL_SERVICE_KEY',
];

const SKIP_DIRS = new Set(['node_modules', 'coverage', 'dist', '.git', '.wrangler']);

/**
 * Blank out comments while preserving every other character's position, so
 * reported line and column numbers still match the file on disk.
 */
export function stripComments(source) {
  let out = '';
  let state = 'code'; // code | line | block | single | double | template
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];

    if (state === 'code') {
      if (char === '/' && next === '/') {
        state = 'line';
        out += '  ';
        i += 1;
        continue;
      }
      if (char === '/' && next === '*') {
        state = 'block';
        out += '  ';
        i += 1;
        continue;
      }
      if (char === '"' || char === "'" || char === '`') {
        state = char === '"' ? 'double' : char === "'" ? 'single' : 'template';
        out += char;
        continue;
      }
      out += char;
      continue;
    }

    if (state === 'line') {
      if (char === '\n') {
        state = 'code';
        out += char;
      } else {
        out += ' ';
      }
      continue;
    }

    if (state === 'block') {
      if (char === '*' && next === '/') {
        state = 'code';
        out += '  ';
        i += 1;
        continue;
      }
      out += char === '\n' ? '\n' : ' ';
      continue;
    }

    // Inside a string literal: copy through, honouring escapes.
    if (char === '\\') {
      out += char + (next ?? '');
      i += 1;
      continue;
    }
    if (
      (state === 'double' && char === '"') ||
      (state === 'single' && char === "'") ||
      (state === 'template' && char === '`')
    ) {
      state = 'code';
    }
    out += char;
  }
  return out;
}

function positionOf(source, index) {
  const before = source.slice(0, index);
  const line = before.split('\n').length;
  const column = index - before.lastIndexOf('\n');
  return { line, column };
}

/**
 * Return the violations in one file's source.
 *
 * `scope` is 'client' for anything that ships to a browser bundle and 'server'
 * for Edge Functions, where only the literal credentials are forbidden.
 */
export function scanSource(source, { scope = 'server' } = {}) {
  const code = stripComments(source);
  const violations = [];
  const patterns = [...LITERAL_CREDENTIALS];
  if (scope === 'client') patterns.push(...CLIENT_ONLY_FORBIDDEN);

  for (const needle of patterns) {
    const quoted = new RegExp(`(['"\`])${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\1`, 'g');
    const bare = scope === 'client' ? new RegExp(`\\b${needle}\\b`, 'g') : null;
    const matcher = bare ?? quoted;
    let match;
    while ((match = matcher.exec(code)) !== null) {
      const { line, column } = positionOf(code, match.index);
      violations.push({ needle, line, column, excerpt: match[0] });
    }
  }
  return violations;
}

function walk(dir) {
  const files = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...walk(full));
    } else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

/** Every shipped file that must be clean, with the rules that apply to it. */
export function targets(root = ROOT) {
  const server = walk(join(root, 'supabase', 'functions'))
    .filter((file) => !/_test\.(ts|js)$/.test(file))
    .map((file) => ({ file, scope: 'server' }));
  const client = walk(join(root, 'src'))
    // Tests are allowed to name the key; nothing there reaches a browser.
    .filter((file) => !/__tests__[\\/]|(\.|_)test\.(ts|tsx|js|jsx)$/.test(file))
    .map((file) => ({ file, scope: 'client' }));
  return [...server, ...client];
}

export function scanTree(root = ROOT) {
  const findings = [];
  for (const { file, scope } of targets(root)) {
    const source = readFileSync(file, 'utf8');
    for (const violation of scanSource(source, { scope })) {
      findings.push({ file: relative(root, file), ...violation });
    }
  }
  return findings;
}

function main() {
  const findings = scanTree();
  if (findings.length === 0) {
    console.log('check:creds — no literal credential fallbacks in server or client code.');
    return 0;
  }
  console.error(`check:creds — ${findings.length} credential fallback(s) found:`);
  for (const finding of findings) {
    console.error(`  ${finding.file}:${finding.line}:${finding.column}  ${finding.needle}  (${finding.excerpt})`);
  }
  console.error(
    '\nA missing credential must fail closed. Read the key from the environment and refuse the request when it is absent.',
  );
  return 1;
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main());
}
