// @vitest-environment node
/**
 * Proving tests for `supabase/functions/_shared/mcpSession.ts`.
 *
 * A session token is the only thing standing between an authenticated handshake
 * and an unauthenticated follow-up, so the negative cases carry the weight:
 * edited payloads, a different key, an expired token and a token signed with the
 * wrong version prefix must all fail. The signature is checked before the expiry
 * is read, so a forged far-future token cannot pass by looking fresh.
 */
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SESSION_TTL_SECONDS,
  MAX_SESSION_TTL_SECONDS,
  SessionSecretMissingError,
  createSession,
  subjectForCaller,
  verifySession,
} from '../supabase/functions/_shared/mcpSession.ts';

const SECRET = 'test-secret-not-a-fallback';
const NOW = 1_700_000_000_000; // seconds: 1700000000

describe('createSession', () => {
  it('mints a three-part token bound to the subject', async () => {
    const { token, session } = await createSession({
      secret: SECRET,
      subject: 'user-1',
      nowMs: NOW,
      id: 'fixed-id',
    });

    expect(token.split('.')).toHaveLength(3);
    expect(token.startsWith('v1.')).toBe(true);
    expect(session).toEqual({
      id: 'fixed-id',
      subject: 'user-1',
      expiresAt: Math.floor(NOW / 1000) + DEFAULT_SESSION_TTL_SECONDS,
    });
  });

  it('generates a distinct id when none is supplied', async () => {
    const a = await createSession({ secret: SECRET, subject: 'user-1', nowMs: NOW });
    const b = await createSession({ secret: SECRET, subject: 'user-1', nowMs: NOW });
    expect(a.session.id).not.toBe(b.session.id);
    expect(a.session.id).toMatch(/^[0-9a-f]{32}$/);
  });

  it('clamps a silly ttl', async () => {
    const long = await createSession({ secret: SECRET, subject: 's', nowMs: NOW, ttlSeconds: 10_000_000 });
    const short = await createSession({ secret: SECRET, subject: 's', nowMs: NOW, ttlSeconds: 0 });
    expect(long.session.expiresAt - Math.floor(NOW / 1000)).toBe(MAX_SESSION_TTL_SECONDS);
    expect(short.session.expiresAt - Math.floor(NOW / 1000)).toBe(1);
  });

  it('refuses to mint a token with no signing secret', async () => {
    await expect(createSession({ secret: undefined, subject: 'user-1' })).rejects.toBeInstanceOf(
      SessionSecretMissingError,
    );
  });

  it('refuses an empty subject', async () => {
    await expect(createSession({ secret: SECRET, subject: '  ' })).rejects.toThrow();
  });
});

describe('verifySession', () => {
  it('round-trips a session it minted', async () => {
    const { token, session } = await createSession({
      secret: SECRET,
      subject: 'user-1',
      nowMs: NOW,
      id: 'abc',
    });

    const checked = await verifySession(token, { secret: SECRET, nowMs: NOW + 1000 });
    expect(checked.ok).toBe(true);
    expect(checked.session).toEqual(session);
  });

  it('rejects a token whose payload was edited to another subject', async () => {
    const { token } = await createSession({ secret: SECRET, subject: 'user-1', nowMs: NOW });
    const [version, payload, signature] = token.split('.');
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    decoded.subject = 'user-2';
    const forged = `${version}.${Buffer.from(JSON.stringify(decoded)).toString('base64url')}.${signature}`;

    const checked = await verifySession(forged, { secret: SECRET, nowMs: NOW });
    expect(checked.ok).toBe(false);
    expect(checked.reason).toContain('signature');
  });

  it('rejects a token signed with another key', async () => {
    const { token } = await createSession({ secret: SECRET, subject: 'user-1', nowMs: NOW });
    const checked = await verifySession(token, { secret: 'a-different-key', nowMs: NOW });
    expect(checked.ok).toBe(false);
  });

  it('rejects an expired token', async () => {
    const { token } = await createSession({ secret: SECRET, subject: 'user-1', nowMs: NOW, ttlSeconds: 60 });
    const justInside = await verifySession(token, {
      secret: SECRET,
      nowMs: NOW + 59_000,
    });
    const justOutside = await verifySession(token, {
      secret: SECRET,
      nowMs: NOW + 61_000,
    });

    expect(justInside.ok).toBe(true);
    expect(justOutside.ok).toBe(false);
    expect(justOutside.reason).toContain('expired');
  });

  it('rejects a re-labelled version prefix', async () => {
    const { token } = await createSession({ secret: SECRET, subject: 'user-1', nowMs: NOW });
    const parts = token.split('.');
    const relabelled = ['v2', parts[1], parts[2]].join('.');
    const checked = await verifySession(relabelled, { secret: SECRET, nowMs: NOW });
    expect(checked.ok).toBe(false);
    expect(checked.reason).toContain('unsupported session version');
  });

  it('rejects malformed input without throwing', async () => {
    for (const candidate of [null, 42, '', 'not-a-token', 'v1.only-two', 'v1.!!!.abc']) {
      const checked = await verifySession(candidate, { secret: SECRET, nowMs: NOW });
      expect(checked.ok, `accepted ${String(candidate)}`).toBe(false);
    }
  });

  it('throws when the environment has no secret, rather than treating it as valid', async () => {
    const { token } = await createSession({ secret: SECRET, subject: 'user-1', nowMs: NOW });
    await expect(verifySession(token, { secret: undefined, nowMs: NOW })).rejects.toBeInstanceOf(
      SessionSecretMissingError,
    );
  });
});

describe('subjectForCaller', () => {
  it('binds a user to their own id and everything else to internal', () => {
    expect(subjectForCaller({ kind: 'user', userId: 'user-1' })).toBe('user-1');
    expect(subjectForCaller({ kind: 'user', userId: null })).toBe('internal');
    expect(subjectForCaller({ kind: 'internal', userId: null })).toBe('internal');
  });
});
