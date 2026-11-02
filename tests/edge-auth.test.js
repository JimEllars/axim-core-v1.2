// @vitest-environment node
/**
 * Executable proof that `_shared/edgeAuth.ts` is whole again.
 *
 * On 2026-11-01 `main` carried a committed conflict marker through the middle of
 * that file (merge commit 4dc7151). Both halves had to survive: the tenancy
 * `claimFromToken()` helper added by #491 and the versioned-signature block
 * added by #492. Parsing alone does not prove that, so these tests call both
 * halves of the real module.
 *
 * `edgeAuth.ts` is deliberately dependency-free (no Deno APIs, no Supabase
 * import), which is why it can run under Node here even though it ships to Deno.
 *
 * Overlap note: `supabase/functions/_shared/signature_test.ts` asserts the same
 * properties under `deno test`. That runner is not part of any workflow and the
 * `deno` binary is not installed, so this file is the only executed proof.
 */
import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_LEGACY_SUNSET,
  SIGNATURE_MAX_SKEW_SECONDS,
  claimFromToken,
  keysFromEnv,
  resolveCaller,
  timingSafeEqual,
  verifySignedRequest,
} from '../supabase/functions/_shared/edgeAuth.ts';

const SECRET = 'shared-secret';
const BODY = JSON.stringify({ app_id: 'speedreport', event: 'ping' });

function hmacHex(secret, message) {
  return createHmac('sha256', secret).update(message).digest('hex');
}

function v2Headers(signature, timestamp) {
  return new Headers({
    'X-Axim-Signature-Version': '2',
    'X-Axim-Timestamp': String(timestamp),
    'X-Axim-Signature': `sha256=${signature}`,
  });
}

function b64url(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function jwt(payload) {
  return `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url(payload)}.sig`;
}

describe('verifySignedRequest — v2 (timestamped)', () => {
  const now = 1_780_000_000_000;
  const seconds = now / 1000;

  it('accepts a signature over "<timestamp>.<body>"', async () => {
    const signature = hmacHex(SECRET, `${seconds}.${BODY}`);
    const result = await verifySignedRequest({
      headers: v2Headers(signature, seconds),
      rawBody: BODY,
      secret: SECRET,
      nowMs: now,
    });

    expect(result).toEqual({ ok: true, mode: 'v2' });
  });

  it('refuses a replayed request outside the 5 minute window', async () => {
    const stale = seconds - SIGNATURE_MAX_SKEW_SECONDS - 1;
    const signature = hmacHex(SECRET, `${stale}.${BODY}`);
    const result = await verifySignedRequest({
      headers: v2Headers(signature, stale),
      rawBody: BODY,
      secret: SECRET,
      nowMs: now,
    });

    expect(result.ok).toBe(false);
    expect(result.mode).toBe('v2');
    expect(result.reason).toMatch(/5 minute window/);
  });

  it('refuses a body-only signature presented as v2', async () => {
    // The replay hole the v2 form exists to close: HMAC(body) alone must not
    // authenticate a v2 request, because it is not bound to the timestamp.
    const signature = hmacHex(SECRET, BODY);
    const result = await verifySignedRequest({
      headers: v2Headers(signature, seconds),
      rawBody: BODY,
      secret: SECRET,
      nowMs: now,
    });

    expect(result).toEqual({ ok: false, mode: 'v2', reason: 'signature mismatch' });
  });

  it('requires a timestamp on v2', async () => {
    const headers = new Headers({
      'X-Axim-Signature-Version': '2',
      'X-Axim-Signature': `sha256=${hmacHex(SECRET, BODY)}`,
    });
    const result = await verifySignedRequest({ headers, rawBody: BODY, secret: SECRET, nowMs: now });

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/requires X-Axim-Timestamp/);
  });
});

describe('verifySignedRequest — legacy (body-only)', () => {
  const now = 1_780_000_000_000;

  it('is accepted before the sunset date', async () => {
    const headers = new Headers({ 'X-Axim-Signature': `sha256=${hmacHex(SECRET, BODY)}` });
    const result = await verifySignedRequest({ headers, rawBody: BODY, secret: SECRET, nowMs: now });

    expect(result).toEqual({ ok: true, mode: 'legacy' });
  });

  it('is refused once the sunset date has passed', async () => {
    const headers = new Headers({ 'X-Axim-Signature': `sha256=${hmacHex(SECRET, BODY)}` });
    const afterSunset = Date.parse(DEFAULT_LEGACY_SUNSET) + 1000;
    const result = await verifySignedRequest({
      headers,
      rawBody: BODY,
      secret: SECRET,
      nowMs: afterSunset,
    });

    expect(result.ok).toBe(false);
    expect(result.mode).toBe('legacy');
    expect(result.reason).toMatch(/retired/);
  });
});

describe('verifySignedRequest — failures are closed', () => {
  it('fails closed when no secret is configured', async () => {
    const headers = v2Headers('a'.repeat(64), Math.floor(Date.now() / 1000));
    const result = await verifySignedRequest({ headers, rawBody: BODY, secret: undefined });

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/no signing secret/);
  });

  it('rejects a malformed signature', async () => {
    const headers = new Headers({ 'X-Axim-Signature': 'sha256=not-a-hash' });
    const result = await verifySignedRequest({ headers, rawBody: BODY, secret: SECRET });

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/malformed/);
  });
});

describe('claimFromToken — the tenancy half of the same file', () => {
  it('reads a nested claim out of an already-verified token', () => {
    const token = jwt({ sub: 'user-1', app_metadata: { tenant_id: 'speedreport' } });

    expect(claimFromToken(token, 'sub')).toBe('user-1');
    expect(claimFromToken(token, 'app_metadata.tenant_id')).toBe('speedreport');
  });

  it('returns undefined for an absent claim and for junk input', () => {
    const token = jwt({ sub: 'user-1' });

    expect(claimFromToken(token, 'app_metadata.tenant_id')).toBeUndefined();
    expect(claimFromToken('not-a-jwt', 'sub')).toBeUndefined();
  });
});

describe('timingSafeEqual', () => {
  it('compares equal and unequal strings', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
    expect(timingSafeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('caller resolution', () => {
  const keys = { internalKey: 'internal-key', serviceKey: 'service-role' };

  it('treats an internal key as an internal call', async () => {
    const headers = new Headers({ 'X-Axim-Internal-Service-Key': keys.internalKey });
    await expect(resolveCaller(headers, keys)).resolves.toEqual({ kind: 'internal', userId: null });
  });

  it('does not treat a forged bearer as internal', async () => {
    const headers = new Headers({ Authorization: 'Bearer wrong-key' });
    const result = await resolveCaller(headers, keys, async () => null);
    expect(result).toEqual({ kind: 'anonymous', userId: null });
  });

  it('fails closed when no keys are configured', async () => {
    expect(keysFromEnv({ get: () => undefined })).toEqual({
      internalKey: undefined,
      serviceKey: undefined,
      serviceKeyLegacy: undefined,
    });
    const headers = new Headers({ Authorization: 'Bearer anything' });
    await expect(resolveCaller(headers, keysFromEnv({ get: () => undefined }))).resolves.toEqual({
      kind: 'anonymous',
      userId: null,
    });
  });
});
