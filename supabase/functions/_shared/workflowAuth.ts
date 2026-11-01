/**
 * Authentication primitives shared by the workflow edge functions.
 *
 * Deliberately free of `Deno.*` access so the logic can be unit-tested under
 * Vitest as well as run on Supabase Edge. Callers pass configuration in.
 *
 * Threat model for `trigger-workflow`: it runs with the service-role client and
 * can write to any table, fetch arbitrary URLs (api_call nodes) and send email.
 * Before this module existed the function had **no** authentication at all -
 * any anonymous POST could drive it. Accepted callers are now:
 *
 *   1. HMAC-SHA256 over the raw body with AXIM_INTERNAL_KEY, plus a fresh
 *      X-Axim-Timestamp (<= 300s). Preferred for machine-to-machine relays.
 *   2. Bearer token equal to a configured service key (AXIM_SERVICE_KEY /
 *      AXIM_INTERNAL_KEY). Used by pg_cron and sibling edge functions.
 *   3. Bearer Supabase JWT that `auth.getUser()` resolves. Used by the dashboard.
 *
 * A presented-but-invalid signature is rejected outright rather than falling
 * through to the next mechanism, so a caller cannot downgrade to a weaker path
 * by attaching a junk X-Axim-Signature header.
 */

export const REPLAY_WINDOW_SECONDS = 300;

export type CallerRole = "service_role" | "authenticated";
export type AuthVia = "hmac" | "internal_key" | "service_key" | "service_role_key" | "user_jwt";

export interface WorkflowCaller {
  role: CallerRole;
  /** Supabase user id for `user_jwt` callers; null for machine callers. */
  userId: string | null;
  via: AuthVia;
}

export interface ServiceKeyCandidate {
  key: string | null | undefined;
  via: AuthVia;
}

export interface WorkflowAuthInput {
  /** Raw `Authorization` header, if any. */
  authorization: string | null;
  signature: string | null;
  timestamp: string | null;
  /** Exact bytes the signature was computed over. */
  rawBody: string;
  internalKey: string | null;
  /** Machine credentials accepted as a bearer token, with their provenance. */
  serviceKeys: ServiceKeyCandidate[];
  /** Unix seconds. Injected so tests can pin the clock. */
  nowSeconds: number;
  /** Resolves a Supabase user from a bearer JWT; returns null when invalid. */
  getUser?: (token: string) => Promise<{ id: string } | null>;
}

/** Constant-time-ish comparison. Never short-circuits on content. */
export function timingSafeEqual(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const left = a.trim();
  const right = b.trim();
  if (left.length === 0 || left.length !== right.length) return false;

  let diff = 0;
  for (let i = 0; i < left.length; i += 1) {
    diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return diff === 0;
}

/** Signature comparison. Both sides are lower-cased hex. */
export function timingSafeEqualHex(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  return timingSafeEqual(a.toLowerCase(), b.toLowerCase());
}

export function parseBearerToken(header: string | null | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return null;
  const token = match[1].trim();
  return token.length > 0 ? token : null;
}

/**
 * A timestamp is fresh when it parses to Unix seconds inside the replay window.
 * A missing or unparseable header is *not* fresh - absence is a failure, not a
 * free pass.
 */
export function isTimestampFresh(
  timestamp: string | null | undefined,
  nowSeconds: number,
  windowSeconds: number = REPLAY_WINDOW_SECONDS,
): boolean {
  if (timestamp === null || timestamp === undefined || timestamp === "") return false;
  const parsed = Number.parseInt(String(timestamp).trim(), 10);
  if (!Number.isFinite(parsed)) return false;
  return Math.abs(nowSeconds - parsed) <= windowSeconds;
}

/** Hex HMAC-SHA256 of `message` keyed with `secret`. */
export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Verify an HMAC signature and its replay window.
 * Returns "valid" | "missing" | "stale" | "mismatch" so callers can return a
 * diagnostic while still answering 401.
 */
export async function verifySignature(input: {
  signature: string | null;
  timestamp: string | null;
  rawBody: string;
  internalKey: string | null;
  nowSeconds: number;
  windowSeconds?: number;
}): Promise<"valid" | "missing" | "stale" | "mismatch"> {
  const { signature, timestamp, rawBody, internalKey, nowSeconds } = input;

  if (!signature || !internalKey) return "missing";
  if (!isTimestampFresh(timestamp, nowSeconds, input.windowSeconds)) return "stale";

  const expected = await hmacSha256Hex(internalKey, rawBody);
  return timingSafeEqualHex(expected, signature) ? "valid" : "mismatch";
}

function matchesServiceKey(
  token: string,
  serviceKeys: ServiceKeyCandidate[],
): AuthVia | null {
  for (const { key, via } of serviceKeys) {
    if (!key) continue;
    if (timingSafeEqual(token, key)) return via;
  }
  return null;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Postgres `user_id` columns are UUIDs. Internal callers legitimately pass
 * sentinel values such as "system", which would abort the whole insert with
 * `invalid input syntax for type uuid`. Coerce anything non-UUID to null so the
 * execution row is still persisted.
 */
export function coerceUuidOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return UUID_PATTERN.test(trimmed) ? trimmed : null;
}

/**
 * Decide who is calling. Returns null for anonymous/invalid callers; the route
 * handler turns that into a 401 without ever touching the service-role client.
 */
export async function resolveWorkflowCaller(
  input: WorkflowAuthInput,
): Promise<WorkflowCaller | null> {
  const {
    authorization,
    signature,
    timestamp,
    rawBody,
    internalKey,
    serviceKeys,
    nowSeconds,
    getUser,
  } = input;

  // 1. Signed relay. A present-but-bad signature is terminal.
  if (signature) {
    const verdict = await verifySignature({
      signature,
      timestamp,
      rawBody,
      internalKey,
      nowSeconds,
    });
    return verdict === "valid"
      ? { role: "service_role", userId: null, via: "hmac" }
      : null;
  }

  const token = parseBearerToken(authorization);

  // 2. Machine bearer (pg_cron, sibling functions).
  if (token) {
    const via = matchesServiceKey(token, serviceKeys);
    if (via) return { role: "service_role", userId: null, via };
  }

  // 3. Dashboard user JWT.
  if (token && getUser) {
    try {
      const user = await getUser(token);
      if (user?.id) return { role: "authenticated", userId: user.id, via: "user_jwt" };
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * A `user_jwt` caller may only act as themselves. Machine callers may target any
 * user (they are trusted relays), but they must still supply an explicit id.
 */
export function resolveActingUserId(
  caller: WorkflowCaller,
  requestedUserId: string | null | undefined,
): { userId: string | null; error?: string } {
  const requested = requestedUserId ? String(requestedUserId) : null;

  if (caller.role === "service_role") {
    return { userId: requested };
  }

  if (requested && requested !== caller.userId) {
    return {
      userId: caller.userId,
      error: "user_jwt callers may only run workflows for their own user id",
    };
  }

  return { userId: caller.userId };
}
