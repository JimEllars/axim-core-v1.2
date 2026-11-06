// @vitest-environment node
/**
 * Proving tests for `supabase/functions/_shared/mcpQuota.ts`.
 *
 * Two things these pin beyond "the counter counts":
 *
 *   - **the bucket key is the subject, not the credential.** The Cloudflare
 *     bridge keys its limiter on the raw bearer token, so its Map holds every
 *     operator's live key. `quotaSubject` is asserted to be derived from the
 *     user id or the caller kind, and a token string must never reach the key.
 *   - **the map is bounded and evicts by age.** An unbounded keyed cache in a
 *     long-lived isolate is a memory leak with a remote trigger.
 */
import { describe, expect, it } from 'vitest';

import {
  MemoryQuotaStore,
  REQUEST_QUOTA,
  WRITE_QUOTA,
  chargeRequestQuota,
  chargeWriteQuota,
  quotaSubject,
  requestQuotaKey,
  requestQuotaRejection,
  writeQuotaKey,
} from '../supabase/functions/_shared/mcpQuota.ts';

const POLICY = { limit: 3, windowSeconds: 60 };
const T0 = 1_780_000_000_000;

function fixedClock(start = T0) {
  let now = start;
  return {
    now: () => now,
    advance(ms) {
      now += ms;
      return now;
    },
  };
}

describe('MemoryQuotaStore — counting', () => {
  it('allows exactly `limit` calls, then denies', () => {
    const store = new MemoryQuotaStore();
    const outcomes = [0, 1, 2, 3].map(() => store.consume('k', POLICY, T0));

    expect(outcomes.map((o) => o.allowed)).toEqual([true, true, true, false]);
    expect(outcomes[0].remaining).toBe(2);
    expect(outcomes[2].remaining).toBe(0);
  });

  it('reports a retry delay that points at the end of the window', () => {
    const store = new MemoryQuotaStore();
    store.consume('k', POLICY, T0);
    store.consume('k', POLICY, T0);
    store.consume('k', POLICY, T0);
    const denied = store.consume('k', POLICY, T0 + 15_000);

    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSeconds).toBe(45);
    expect(denied.resetAtMs).toBe(T0 + 60_000);
  });

  it('never reports a retry delay below one second', () => {
    const store = new MemoryQuotaStore();
    for (let i = 0; i < POLICY.limit; i += 1) store.consume('k', POLICY, T0);
    const denied = store.consume('k', POLICY, T0 + 59_999);

    // At 59.999 s the honest remainder rounds to 1 s, not 0 — a `Retry-After: 0`
    // invites the client to hammer the same window.
    expect(denied.retryAfterSeconds).toBe(1);
  });

  it('resets the count once the window has elapsed', () => {
    const store = new MemoryQuotaStore();
    for (let i = 0; i < POLICY.limit; i += 1) store.consume('k', POLICY, T0);
    expect(store.consume('k', POLICY, T0 + 59_999).allowed).toBe(false);
    expect(store.consume('k', POLICY, T0 + 60_000).allowed).toBe(true);
  });

  it('keeps separate budgets per key', () => {
    const store = new MemoryQuotaStore();
    for (let i = 0; i < POLICY.limit; i += 1) store.consume('a', POLICY, T0);

    expect(store.consume('a', POLICY, T0).allowed).toBe(false);
    expect(store.consume('b', POLICY, T0).allowed).toBe(true);
  });

  it('restarts the window when the policy length changes under the same key', () => {
    const store = new MemoryQuotaStore();
    for (let i = 0; i < POLICY.limit; i += 1) store.consume('k', POLICY, T0);

    // Same key, tighter window: a count gathered over 60 s must not be compared
    // against a 10 s limit.
    expect(store.consume('k', { limit: 1, windowSeconds: 10 }, T0).allowed).toBe(true);
  });
});

describe('MemoryQuotaStore — bounded memory', () => {
  it('never exceeds `maxKeys`', () => {
    const store = new MemoryQuotaStore(3);

    for (let i = 0; i < 50; i += 1) store.consume(`k${i}`, POLICY, T0 + i);

    expect(store.size).toBeLessThanOrEqual(3);
  });

  it('sweeps expired buckets before dropping live ones', () => {
    const store = new MemoryQuotaStore(2);
    store.consume('old-a', POLICY, T0);
    store.consume('old-b', POLICY, T0);
    // Far past the window: both are expired, so a thrash of new keys should not
    // need to evict anything that is still counting.
    store.consume('fresh', POLICY, T0 + 10 * 60_000);

    expect(store.size).toBe(1);
  });

  it('drops the oldest window when everything is live', () => {
    const store = new MemoryQuotaStore(2);
    store.consume('first', POLICY, T0);
    store.consume('second', POLICY, T0 + 1);
    store.consume('third', POLICY, T0 + 2);

    // "first" was evicted, so its budget restarts from zero rather than being
    // denied by a counter nobody can see.
    expect(store.consume('first', POLICY, T0 + 3).remaining).toBe(POLICY.limit - 1);
  });

  it('treats a nonsense maxKeys as 1 rather than as unbounded', () => {
    expect(new MemoryQuotaStore(0).size).toBe(0);
    const store = new MemoryQuotaStore(0);
    store.consume('a', POLICY, T0);
    store.consume('b', POLICY, T0);
    expect(store.size).toBe(1);
  });
});

describe('keys', () => {
  it('keys a user caller by user id', () => {
    expect(quotaSubject({ kind: 'user', userId: 'u-1', via: 'user_jwt' })).toBe('user:u-1');
  });

  it('keys an internal caller by how it authenticated, never by the key itself', () => {
    const subject = quotaSubject({ kind: 'internal', userId: null, via: 'internal_key' });

    expect(subject).toBe('internal:internal_key');
    expect(subject).not.toContain('Bearer');
  });

  it('gives the write budget its own key so writes cannot spend the read budget', () => {
    const caller = { kind: 'user', userId: 'u-1', via: 'user_jwt' };

    expect(writeQuotaKey(caller)).not.toBe(requestQuotaKey(caller));
    expect(writeQuotaKey(caller)).toBe('user:u-1#write');
  });
});

describe('charge helpers', () => {
  it('charges the shared request quota by default and honours an injected store', () => {
    const store = new MemoryQuotaStore();
    const clock = fixedClock();

    const outcomes = [0, 1].map(() =>
      chargeRequestQuota({ kind: 'user', userId: 'u-1', via: 'user_jwt' }, { store, now: clock.now, policy: { limit: 1, windowSeconds: 60 } }),
    );

    expect(outcomes[0].allowed).toBe(true);
    expect(outcomes[1].allowed).toBe(false);
  });

  it('charges writes against WRITE_QUOTA, which is tighter than the request quota', () => {
    expect(WRITE_QUOTA.limit).toBeLessThan(REQUEST_QUOTA.limit);
    expect(WRITE_QUOTA.windowSeconds).toBe(REQUEST_QUOTA.windowSeconds);

    const store = new MemoryQuotaStore();
    let denied = null;
    const caller = { kind: 'user', userId: 'u-1', via: 'user_jwt' };

    for (let i = 0; i < WRITE_QUOTA.limit + 1; i += 1) {
      const outcome = chargeWriteQuota(caller, { store, now: () => T0 });
      if (!outcome.allowed) denied = outcome;
    }

    expect(denied).not.toBeNull();
    expect(denied.limit).toBe(WRITE_QUOTA.limit);
  });
});

describe('requestQuotaRejection', () => {
  it('returns null while the caller is inside the budget', () => {
    const store = new MemoryQuotaStore();

    expect(
      requestQuotaRejection(
        { kind: 'user', userId: 'u-1', via: 'user_jwt' },
        { store, now: () => T0, policy: { limit: 2, windowSeconds: 60 } },
      ),
    ).toBeNull();
  });

  it('returns a 429 with Retry-After once the budget is spent', () => {
    const store = new MemoryQuotaStore();
    const caller = { kind: 'user', userId: 'u-1', via: 'user_jwt' };
    const charge = { store, now: () => T0 + 30_000, policy: { limit: 1, windowSeconds: 60 } };

    expect(requestQuotaRejection(caller, charge)).toBeNull();
    const rejection = requestQuotaRejection(caller, charge);

    expect(rejection.status).toBe(429);
    // The first call opened the window at T0+30 s, so the wait is the rest of it.
    expect(rejection.headers['Retry-After']).toBe('60');
    expect(rejection.body.error).toContain('rate limited');
    expect(rejection.body.error).toContain('1 requests per window');
  });
});
