// @vitest-environment node
/**
 * Proving tests for `supabase/functions/_shared/edgeCaller.ts`.
 *
 * `robotics-emergency-stop` and `robotics-sim-drainer` run with
 * `verify_jwt = false`, so the platform checks nothing and the function has to
 * decide for itself. These tests pin that decision:
 *
 *   - anonymous callers are refused on every robotics operation, including the
 *     fleet stop (an unauthenticated halt endpoint is a remote off switch);
 *   - a *presented* signature must verify — a forged one is terminal and never
 *     downgrades to a bearer check, which is the bypass that made the old
 *     `trigger-workflow` classification exploitable;
 *   - a v2 signature outside the 5 minute window is refused;
 *   - only internal callers may drain the simulation queue.
 *
 * `edgeCaller.ts` has no `Deno.*` access, which is why it runs here.
 */
import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

import {
  authorizeQueueDrain,
  authorizeRoboticsOperation,
  classifyDepsFromEnv,
  classifyEdgeCaller,
} from '../supabase/functions/_shared/edgeCaller.ts';

const SECRET = 'test-shared-secret';
const SERVICE_KEY = 'service-role-key';
const BODY = JSON.stringify({ project_id: '3f0e1d2c-1b2a-4c5d-8e9f-0a1b2c3d4e5f' });
const NOW = 1_780_000_000_000;

const hmac = (message) => createHmac('sha256', SECRET).update(message).digest('hex');

const v2 = (seconds) =>
  new Headers({
    'X-Axim-Signature-Version': '2',
    'X-Axim-Timestamp': String(seconds),
    'X-Axim-Signature': `sha256=${hmac(`${seconds}.${BODY}`)}`,
  });

const legacy = () =>
  new Headers({ 'X-Axim-Signature': `sha256=${hmac(BODY)}` });

const bearer = (token) => new Headers({ Authorization: `Bearer ${token}` });

const baseDeps = {
  internalKey: SECRET,
  keys: { internalKey: SECRET, serviceKey: SERVICE_KEY },
  nowMs: NOW,
};

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

describe('classifyEdgeCaller — signed relays', () => {
  it('accepts a v2 signature inside the window', async () => {
    const result = await classifyEdgeCaller(v2(NOW / 1000), BODY, baseDeps);
    expect(result).toMatchObject({ kind: 'internal', via: 'hmac:v2' });
  });

  it('refuses a v2 signature older than 5 minutes', async () => {
    const stale = await classifyEdgeCaller(v2(NOW / 1000 - 301), BODY, baseDeps);
    expect(stale).toMatchObject({ kind: 'anonymous', via: 'anonymous' });
    expect(stale.rejection).toMatch(/5 minute window/);
  });

  it('refuses a v2 signature from the future beyond the window', async () => {
    const ahead = await classifyEdgeCaller(v2(NOW / 1000 + 400), BODY, baseDeps);
    expect(ahead.kind).toBe('anonymous');
    expect(ahead.rejection).toMatch(/5 minute window/);
  });

  it('refuses a signature over different bytes', async () => {
    const headers = new Headers({
      'X-Axim-Signature-Version': '2',
      'X-Axim-Timestamp': String(NOW / 1000),
      'X-Axim-Signature': `sha256=${hmac(`${NOW / 1000}.${BODY}tampered`)}`,
    });
    const result = await classifyEdgeCaller(headers, BODY, baseDeps);
    expect(result.kind).toBe('anonymous');
    expect(result.rejection).toMatch(/signature mismatch/);
  });

  it('accepts the legacy body-only form until the sunset', async () => {
    const result = await classifyEdgeCaller(legacy(), BODY, baseDeps);
    expect(result).toMatchObject({ kind: 'internal', via: 'hmac:legacy' });
  });

  it('refuses the legacy form after the sunset', async () => {
    const result = await classifyEdgeCaller(legacy(), BODY, {
      ...baseDeps,
      nowMs: Date.parse('2027-06-01T00:00:00Z'),
    });
    expect(result.kind).toBe('anonymous');
    expect(result.rejection).toMatch(/retired/);
  });

  it('fails closed when no internal key is configured', async () => {
    const result = await classifyEdgeCaller(legacy(), BODY, { keys: {} });
    expect(result.kind).toBe('anonymous');
    expect(result.rejection).toMatch(/no signing secret/);
  });

  /**
   * The bypass this guards. If a bad signature fell through to the bearer check,
   * anyone could send `X-Axim-Signature: junk` plus a stolen token and skip the
   * HMAC requirement entirely.
   */
  it('refuses a bad signature even when a valid service key is also present', async () => {
    const headers = new Headers({
      'X-Axim-Signature': 'sha256=' + 'a'.repeat(64),
      Authorization: `Bearer ${SERVICE_KEY}`,
    });
    const result = await classifyEdgeCaller(headers, BODY, baseDeps);
    expect(result.kind).toBe('anonymous');
    expect(result.via).toBe('anonymous');
  });
});

describe('classifyEdgeCaller — bearer credentials', () => {
  it('classifies the service key as internal', async () => {
    const result = await classifyEdgeCaller(bearer(SERVICE_KEY), BODY, baseDeps);
    expect(result).toMatchObject({ kind: 'internal', via: 'internal_key' });
  });

  it('classifies the internal service header as internal', async () => {
    const result = await classifyEdgeCaller(
      new Headers({ 'X-Axim-Internal-Service-Key': SECRET }),
      BODY,
      baseDeps,
    );
    expect(result).toMatchObject({ kind: 'internal', via: 'internal_key' });
  });

  it('classifies a verified user token as user', async () => {
    const verifyUser = vi.fn(async () => 'user-1');
    const result = await classifyEdgeCaller(bearer('user-jwt'), BODY, { ...baseDeps, verifyUser });
    expect(result).toMatchObject({ kind: 'user', userId: 'user-1', via: 'user_jwt' });
    expect(verifyUser).toHaveBeenCalledWith('user-jwt');
  });

  it('classifies a token that does not resolve as anonymous', async () => {
    const result = await classifyEdgeCaller(bearer('nope'), BODY, {
      ...baseDeps,
      verifyUser: async () => null,
    });
    expect(result.kind).toBe('anonymous');
  });

  it('classifies a request with no credentials as anonymous', async () => {
    const result = await classifyEdgeCaller(new Headers(), BODY);
    expect(result).toMatchObject({ kind: 'anonymous', userId: null, via: 'anonymous' });
  });

  // A missing env var must not become a working credential.
  it('does not match an empty configured key', async () => {
    const result = await classifyEdgeCaller(bearer(''), BODY, {
      keys: { internalKey: '', serviceKey: '' },
    });
    expect(result.kind).toBe('anonymous');
  });
});

describe('classifyDepsFromEnv', () => {
  it('reads the configured keys', () => {
    const env = {
      get: (key) =>
        ({
          AXIM_INTERNAL_KEY: SECRET,
          SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
        })[key],
    };
    const deps = classifyDepsFromEnv(env);
    expect(deps.internalKey).toBe(SECRET);
    expect(deps.keys.serviceKey).toBe(SERVICE_KEY);
    expect(deps.keys.internalKey).toBe(SECRET);
  });

  it('treats an unset internal key as absent', () => {
    expect(classifyDepsFromEnv({ get: () => undefined }).internalKey).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Authorization
// ---------------------------------------------------------------------------

describe('authorizeRoboticsOperation', () => {
  it('refuses anonymous callers on every operation', () => {
    for (const operation of ['read', 'write', 'fleet_stop']) {
      const decision = authorizeRoboticsOperation({ kind: 'anonymous', userId: null }, operation);
      expect(decision.ok).toBe(false);
      expect(decision.status).toBe(401);
    }
  });

  it('admits a verified user', () => {
    const decision = authorizeRoboticsOperation({ kind: 'user', userId: 'user-1' }, 'write');
    expect(decision).toEqual({ ok: true, status: 200, actorId: 'user-1' });
  });

  it('admits an internal caller without a user id', () => {
    const decision = authorizeRoboticsOperation({ kind: 'internal', userId: null }, 'fleet_stop');
    expect(decision).toEqual({ ok: true, status: 200, actorId: null });
  });
});

describe('authorizeQueueDrain', () => {
  it('admits an internal caller', () => {
    expect(authorizeQueueDrain({ kind: 'internal', userId: null })).toEqual({
      ok: true,
      status: 200,
      actorId: null,
    });
  });

  // Draining dispatches to an operator-configured simulator and mutates rows in
  // bulk. It is a machine operation, not something a dashboard session does.
  it('refuses a verified user with 403', () => {
    const decision = authorizeQueueDrain({ kind: 'user', userId: 'user-1' });
    expect(decision.ok).toBe(false);
    expect(decision.status).toBe(403);
    expect(decision.reason).toMatch(/internal callers only/);
  });

  it('refuses an anonymous caller with 401', () => {
    const decision = authorizeQueueDrain({ kind: 'anonymous', userId: null });
    expect(decision).toMatchObject({ ok: false, status: 401 });
  });
});
