/**
 * Request and write quotas for the AXiM Core MCP surface.
 *
 * The surface had no limiter at all, and the Cloudflare bridge's limiter — the
 * only one in the repository — keys its bucket on the **raw bearer token**
 * (`cloudflare-workers/mcp-bridge/src/rateLimit.ts`), which keeps a live
 * credential as a Map key and never evicts. This module does neither: buckets
 * are keyed by the authenticated *subject* (`user:<uuid>` / `internal:<via>`),
 * and the map is bounded.
 *
 * **What this does and does not buy you.** The store lives in the isolate, so
 * the effective ceiling is `limit × live isolates`, not `limit`. It stops the
 * failure that actually happens — one MCP client in a retry loop, or a model
 * iterating `tools/call` until its context fills — and it costs nothing. It is
 * not a defence against a distributed flood; that belongs at Cloudflare
 * (rate-limiting rules on `/mcp`, `/sse`, `/message`) and remains an operator
 * action. Making the quota durable is a follow-up that needs a table and a
 * round trip per request, which is why it is not folded in here.
 *
 * Counters are fixed-window, so a caller can spend a full window either side of
 * a boundary. That is a documented 2× burst at the seam, not an oversight.
 *
 * No `Deno.*`: the clock and the store are injected, so `tests/mcp-quota.test.js`
 * drives every boundary deterministically under Node.
 */

import type { CallerKind } from "./edgeAuth.ts";

// ---------------------------------------------------------------------------
// Contracts
// ---------------------------------------------------------------------------

export interface QuotaPolicy {
  /** Requests allowed per window. */
  limit: number;
  windowSeconds: number;
}

/** One HTTP request against the MCP surface, whatever the transport. */
export const REQUEST_QUOTA: QuotaPolicy = { limit: 120, windowSeconds: 60 };

/**
 * One mutating tool call. Deliberately much tighter than the request quota:
 * staging an approval is the only write this surface offers, and it is the one
 * action a runaway client could use to bury the operator queue.
 */
export const WRITE_QUOTA: QuotaPolicy = { limit: 20, windowSeconds: 60 };

export type QuotaOutcome =
  | { allowed: true; remaining: number; resetAtMs: number }
  | { allowed: false; limit: number; retryAfterSeconds: number; resetAtMs: number };

export interface QuotaStore {
  consume(key: string, policy: QuotaPolicy, nowMs: number): QuotaOutcome;
}

interface Bucket {
  windowStartMs: number;
  count: number;
  windowSeconds: number;
}

// ---------------------------------------------------------------------------
// In-isolate store
// ---------------------------------------------------------------------------

/**
 * Fixed-window counters in a bounded Map.
 *
 * Bounded because an unbounded keyed cache in a long-lived isolate is a memory
 * leak with a remote trigger. When the map is full, expired buckets are swept
 * first; if that frees nothing, the oldest window is dropped, which costs at
 * most one caller a reset early — it never lets a caller through unbounded.
 */
export class MemoryQuotaStore implements QuotaStore {
  private readonly buckets = new Map<string, Bucket>();
  private readonly maxKeys: number;

  constructor(maxKeys = 5_000) {
    this.maxKeys = Math.max(1, Math.floor(maxKeys));
  }

  get size(): number {
    return this.buckets.size;
  }

  consume(key: string, policy: QuotaPolicy, nowMs: number): QuotaOutcome {
    const windowMs = policy.windowSeconds * 1000;
    const existing = this.buckets.get(key);

    // A changed window length also invalidates the old counter: comparing a count
    // accumulated over a 60 s window against a 10 s limit would be wrong.
    const stale =
      !existing ||
      nowMs - existing.windowStartMs >= windowMs ||
      existing.windowSeconds !== policy.windowSeconds;

    const bucket: Bucket = stale
      ? { windowStartMs: nowMs, count: 0, windowSeconds: policy.windowSeconds }
      : (existing as Bucket);

    const resetAtMs = bucket.windowStartMs + windowMs;

    if (bucket.count >= policy.limit) {
      // Re-set the bucket even on a denial so eviction order tracks use, not
      // first sighting.
      this.store(key, bucket);
      return {
        allowed: false,
        limit: policy.limit,
        retryAfterSeconds: Math.max(1, Math.ceil((resetAtMs - nowMs) / 1000)),
        resetAtMs,
      };
    }

    bucket.count += 1;
    this.store(key, bucket);
    return { allowed: true, remaining: Math.max(0, policy.limit - bucket.count), resetAtMs };
  }

  private store(key: string, bucket: Bucket): void {
    // Delete before set so Map insertion order stays "least recently written
    // last", which is what the eviction below relies on. Deleting first also
    // means re-storing an existing key never triggers an eviction: the size has
    // already dropped by one before the bound is checked.
    this.buckets.delete(key);
    if (this.buckets.size >= this.maxKeys) this.evict(bucket.windowStartMs);
    this.buckets.set(key, bucket);
  }

  private evict(nowMs: number): void {
    for (const [key, bucket] of this.buckets) {
      if (nowMs - bucket.windowStartMs >= bucket.windowSeconds * 1000) this.buckets.delete(key);
    }
    while (this.buckets.size >= this.maxKeys) {
      const oldest = this.buckets.keys().next();
      if (oldest.done) return;
      this.buckets.delete(oldest.value);
    }
  }
}

/** The store the three Edge entrypoints share inside one isolate. */
export const sharedQuotaStore = new MemoryQuotaStore();

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------

export interface CallerLike {
  kind: CallerKind;
  userId: string | null;
  via?: string;
}

/**
 * Bucket key for a caller.
 *
 * Never the credential: the bridge uses the bearer token, so its Map holds
 * every operator's live key in memory and in any crash dump, and two clients
 * sharing one key share a budget without anyone being able to tell.
 */
export function quotaSubject(caller: CallerLike): string {
  if (caller.userId) return `user:${caller.userId}`;
  return `internal:${caller.via ?? caller.kind}`;
}

export function requestQuotaKey(caller: CallerLike): string {
  return quotaSubject(caller);
}

export function writeQuotaKey(caller: CallerLike): string {
  return `${quotaSubject(caller)}#write`;
}

// ---------------------------------------------------------------------------
// Enforcement
// ---------------------------------------------------------------------------

export interface QuotaCharge {
  store?: QuotaStore;
  now?: () => number;
  policy?: QuotaPolicy;
}

export function chargeRequestQuota(caller: CallerLike, charge: QuotaCharge = {}): QuotaOutcome {
  const store = charge.store ?? sharedQuotaStore;
  const now = charge.now ?? Date.now;
  return store.consume(requestQuotaKey(caller), charge.policy ?? REQUEST_QUOTA, now());
}

export function chargeWriteQuota(caller: CallerLike, charge: QuotaCharge = {}): QuotaOutcome {
  const store = charge.store ?? sharedQuotaStore;
  const now = charge.now ?? Date.now;
  return store.consume(writeQuotaKey(caller), charge.policy ?? WRITE_QUOTA, now());
}

export interface QuotaRejection {
  status: 429;
  body: { error: string };
  headers: Record<string, string>;
}

/**
 * The HTTP answer for an over-quota request, or `null` when it may proceed.
 *
 * Transport-agnostic on purpose: the three entrypoints shape responses with
 * their own helpers, and a shared `Response` object here would tie the rule to
 * one transport's headers.
 */
export function requestQuotaRejection(caller: CallerLike, charge: QuotaCharge = {}): QuotaRejection | null {
  const outcome = chargeRequestQuota(caller, charge);
  if (outcome.allowed) return null;

  return {
    status: 429,
    body: {
      error: `rate limited: ${outcome.limit} requests per window; retry in ${outcome.retryAfterSeconds}s`,
    },
    headers: {
      'Retry-After': String(outcome.retryAfterSeconds),
      'X-RateLimit-Limit': String(outcome.limit),
      'X-RateLimit-Remaining': '0',
    },
  };
}
