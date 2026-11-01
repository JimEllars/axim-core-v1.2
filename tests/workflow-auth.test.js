/**
 * Proving tests for supabase/functions/_shared/workflowAuth.ts
 *
 * Context: trigger-workflow previously had no authentication whatsoever while
 * holding a service-role Supabase client. Any anonymous POST could run a
 * workflow, which in turn writes to the database, sends email and performs
 * outbound HTTP (api_call nodes). These tests pin the contract that closes that
 * surface.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  REPLAY_WINDOW_SECONDS,
  coerceUuidOrNull,
  hmacSha256Hex,
  isTimestampFresh,
  parseBearerToken,
  resolveActingUserId,
  resolveWorkflowCaller,
  timingSafeEqual,
  timingSafeEqualHex,
  verifySignature,
} from '../supabase/functions/_shared/workflowAuth.ts';

const INTERNAL_KEY = 'internal-key-abc123';
const SERVICE_KEY = 'service-key-xyz789';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiJ9.service-role';
const NOW = 1_800_000_000;

const baseInput = (overrides = {}) => ({
  authorization: null,
  signature: null,
  timestamp: null,
  rawBody: '{"workflowId":"wf-1"}',
  internalKey: INTERNAL_KEY,
  serviceKeys: [
    { key: INTERNAL_KEY, via: 'internal_key' },
    { key: SERVICE_KEY, via: 'service_key' },
    { key: SERVICE_ROLE_KEY, via: 'service_role_key' },
  ],
  nowSeconds: NOW,
  getUser: vi.fn(async () => null),
  ...overrides,
});

describe('workflow auth: HMAC + replay', () => {
  it(`rejects a timestamp older than ${REPLAY_WINDOW_SECONDS}s`, async () => {
    const rawBody = baseInput().rawBody;
    const staleTs = NOW - REPLAY_WINDOW_SECONDS - 5;
    const signature = await hmacSha256Hex(INTERNAL_KEY, rawBody);

    const verdict = await verifySignature({
      signature,
      timestamp: String(staleTs),
      rawBody,
      internalKey: INTERNAL_KEY,
      nowSeconds: NOW,
    });

    // Correct HMAC, stale clock: still refused.
    expect(verdict).toBe('stale');
    await expect(
      resolveWorkflowCaller(
        baseInput({ signature, timestamp: String(staleTs) }),
      ),
    ).resolves.toBeNull();
  });

  it('accepts a signature over the raw body inside the window', async () => {
    const { rawBody } = baseInput();
    const signature = await hmacSha256Hex(INTERNAL_KEY, rawBody);

    const caller = await resolveWorkflowCaller(
      baseInput({ signature, timestamp: String(NOW - 10) }),
    );

    expect(caller).toEqual({ role: 'service_role', userId: null, via: 'hmac' });
  });

  it('binds the signature to the exact body bytes', async () => {
    const { rawBody } = baseInput();
    const signature = await hmacSha256Hex(INTERNAL_KEY, rawBody);

    const caller = await resolveWorkflowCaller(
      baseInput({
        signature,
        timestamp: String(NOW),
        // Same length, different content: user id swapped.
        rawBody: '{"workflowId":"wf-2"}',
      }),
    );

    expect(caller).toBeNull();
  });

  it('rejects a present-but-invalid signature rather than falling back to the bearer path', async () => {
    const caller = await resolveWorkflowCaller(
      baseInput({
        authorization: `Bearer ${SERVICE_KEY}`,
        signature: 'deadbeef',
        timestamp: String(NOW),
      }),
    );

    expect(caller).toBeNull();
  });

  it('refuses a signature when no internal key is configured', async () => {
    const { rawBody } = baseInput();
    const signature = await hmacSha256Hex(INTERNAL_KEY, rawBody);

    const verdict = await verifySignature({
      signature,
      timestamp: String(NOW),
      rawBody,
      internalKey: null,
      nowSeconds: NOW,
    });

    expect(verdict).toBe('missing');
  });
});

describe('workflow auth: machine bearer credentials', () => {
  it('accepts the internal key', async () => {
    const caller = await resolveWorkflowCaller(
      baseInput({ authorization: `Bearer ${INTERNAL_KEY}` }),
    );
    expect(caller).toMatchObject({ role: 'service_role', via: 'internal_key' });
  });

  it('accepts AXIM_SERVICE_KEY', async () => {
    const caller = await resolveWorkflowCaller(
      baseInput({ authorization: `Bearer ${SERVICE_KEY}` }),
    );
    expect(caller).toMatchObject({ role: 'service_role', via: 'service_key' });
  });

  it('accepts the service-role key used by sibling edge functions', async () => {
    // job-processor and universal-dispatcher authenticate this way.
    const caller = await resolveWorkflowCaller(
      baseInput({ authorization: `Bearer ${SERVICE_ROLE_KEY}` }),
    );
    expect(caller).toMatchObject({ role: 'service_role', via: 'service_role_key' });
  });

  it('rejects an arbitrary bearer token', async () => {
    const caller = await resolveWorkflowCaller(
      baseInput({ authorization: 'Bearer some-other-token' }),
    );
    expect(caller).toBeNull();
  });

  it('rejects an anonymous request with no headers at all', async () => {
    const caller = await resolveWorkflowCaller(baseInput());
    expect(caller).toBeNull();
  });
});

describe('workflow auth: dashboard user JWT', () => {
  it('resolves an authenticated caller from a valid JWT', async () => {
    const getUser = vi.fn(async () => ({ id: '8f1c2a44-1f2e-4b8a-9a51-6b1c2d3e4f50' }));

    const caller = await resolveWorkflowCaller(
      baseInput({ authorization: 'Bearer user-jwt', getUser }),
    );

    expect(getUser).toHaveBeenCalledWith('user-jwt');
    expect(caller).toEqual({
      role: 'authenticated',
      userId: '8f1c2a44-1f2e-4b8a-9a51-6b1c2d3e4f50',
      via: 'user_jwt',
    });
  });

  it('rejects a JWT that resolves to no user', async () => {
    const caller = await resolveWorkflowCaller(
      baseInput({ authorization: 'Bearer expired-jwt', getUser: vi.fn(async () => null) }),
    );
    expect(caller).toBeNull();
  });

  it('swallows a getUser exception as an auth failure', async () => {
    const caller = await resolveWorkflowCaller(
      baseInput({
        authorization: 'Bearer broken-jwt',
        getUser: vi.fn(async () => {
          throw new Error('invalid JWT');
        }),
      }),
    );
    expect(caller).toBeNull();
  });
});

describe('workflow auth: identity binding', () => {
  it('lets a user_jwt caller act only as themselves', () => {
    const caller = { role: 'authenticated', userId: 'user-a', via: 'user_jwt' };

    expect(resolveActingUserId(caller, 'user-a')).toEqual({ userId: 'user-a' });

    const spoofed = resolveActingUserId(caller, 'user-b');
    expect(spoofed.userId).toBe('user-a');
    expect(spoofed.error).toMatch(/own user id/);
  });

  it('lets a machine caller specify the target user', () => {
    const caller = { role: 'service_role', userId: null, via: 'hmac' };
    expect(resolveActingUserId(caller, 'user-b')).toEqual({ userId: 'user-b' });
  });

  it('coerces sentinel user ids to null so the log insert does not abort', () => {
    // job-processor sends userId: 'system'; user_id is a UUID column.
    expect(coerceUuidOrNull('system')).toBeNull();
    expect(coerceUuidOrNull(undefined)).toBeNull();
    expect(coerceUuidOrNull('8f1c2a44-1f2e-4b8a-9a51-6b1c2d3e4f50')).toBe(
      '8f1c2a44-1f2e-4b8a-9a51-6b1c2d3e4f50',
    );
  });
});

describe('workflow auth: primitives', () => {
  it('parses Bearer tokens case-insensitively', () => {
    expect(parseBearerToken('Bearer abc')).toBe('abc');
    expect(parseBearerToken('bearer  abc ')).toBe('abc');
    expect(parseBearerToken('Basic abc')).toBeNull();
    expect(parseBearerToken('Bearer   ')).toBeNull();
    expect(parseBearerToken(null)).toBeNull();
  });

  it('compares without short-circuiting on content', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
    expect(timingSafeEqual('abc', 'ab')).toBe(false);
    expect(timingSafeEqualHex('ABCD', 'abcd')).toBe(true);
  });

  it('treats a missing timestamp as not fresh', () => {
    expect(isTimestampFresh(null, NOW)).toBe(false);
    expect(isTimestampFresh('', NOW)).toBe(false);
    expect(isTimestampFresh('abc', NOW)).toBe(false);
    expect(isTimestampFresh(String(NOW), NOW)).toBe(true);
  });
});
