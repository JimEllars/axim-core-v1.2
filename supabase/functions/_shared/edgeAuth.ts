/**
 * Shared caller classification for Edge Functions.
 *
 * Several functions were protected by an `Authorization` header compared against
 * a literal fallback (`'test_internal_key'`), or by nothing at all. This module
 * centralises the decision so the same rules apply everywhere:
 *
 *   - internal    : a shared service key presented as a bearer token or in
 *                   `X-Axim-Internal-Service-Key`
 *   - user        : a verified Supabase JWT (the caller must resolve the user)
 *   - anonymous   : anything else
 *
 * It is deliberately dependency-free so it can be unit tested without a Deno
 * runtime or a Supabase client.
 */

export type CallerKind = "internal" | "user" | "anonymous";

export interface CallerKeys {
  /** AXIM_INTERNAL_KEY — satellites and sibling services */
  internalKey?: string;
  /** SUPABASE_SERVICE_ROLE_KEY — service-role clients */
  serviceKey?: string;
  /** AXIM_SERVICE_KEY — legacy shared service key */
  serviceKeyLegacy?: string;
}

/** Constant-time string comparison. Length is leaked, contents are not. */
export function timingSafeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  // Pad to a common length so the loop below runs a fixed number of iterations.
  const length = Math.max(left.length, right.length);
  let diff = left.length === right.length ? 0 : 1;
  for (let i = 0; i < length; i += 1) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return diff === 0;
}

function presentedKeys(headers: Headers): string[] {
  const candidates: string[] = [];
  const internalHeader = headers.get("X-Axim-Internal-Service-Key") ?? headers.get(
    "x-axim-internal-service-key",
  );
  if (internalHeader) candidates.push(internalHeader.trim());

  const auth = headers.get("Authorization") ?? headers.get("authorization");
  if (auth && auth.toLowerCase().startsWith("bearer ")) {
    candidates.push(auth.slice(7).trim());
  }
  return candidates;
}

/**
 * True when the request presents one of the configured service credentials.
 * An unset key never matches, so a missing env var fails closed.
 */
export function isInternalServiceCall(headers: Headers, keys: CallerKeys): boolean {
  const expected = [keys.internalKey, keys.serviceKey, keys.serviceKeyLegacy].filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
  if (expected.length === 0) return false;

  const presented = presentedKeys(headers);
  if (presented.length === 0) return false;

  return presented.some((candidate) =>
    expected.some((secret) => timingSafeEqual(candidate, secret))
  );
}

/** True when an Authorization header carries a bearer token worth verifying. */
export function hasBearerToken(headers: Headers): boolean {
  const auth = headers.get("Authorization") ?? headers.get("authorization");
  return Boolean(auth && auth.toLowerCase().startsWith("bearer "));
}

export function bearerToken(headers: Headers): string | null {
  const auth = headers.get("Authorization") ?? headers.get("authorization");
  if (!auth || !auth.toLowerCase().startsWith("bearer ")) return null;
  return auth.slice(7).trim() || null;
}

/**
 * Resolve who is calling.
 *
 * `verifyUser` is injected so this module stays free of Supabase/Deno imports;
 * pass a function that validates the token and returns the user id, or null.
 */
export async function resolveCaller(
  headers: Headers,
  keys: CallerKeys,
  verifyUser?: (token: string) => Promise<string | null>,
): Promise<{ kind: CallerKind; userId: string | null }> {
  if (isInternalServiceCall(headers, keys)) {
    return { kind: "internal", userId: null };
  }

  const token = bearerToken(headers);
  if (!token || !verifyUser) {
    return { kind: "anonymous", userId: null };
  }

  const userId = await verifyUser(token);
  if (!userId) return { kind: "anonymous", userId: null };
  return { kind: "user", userId };
}

/** Read the caller's keys from the environment, without literal fallbacks. */
export function keysFromEnv(env: {
  get(key: string): string | undefined;
}): CallerKeys {
  const value = (name: string) => {
    const raw = env.get(name);
    return raw && raw.length > 0 ? raw : undefined;
  };
  return {
    internalKey: value("AXIM_INTERNAL_KEY"),
    serviceKey: value("SUPABASE_SERVICE_ROLE_KEY"),
    serviceKeyLegacy: value("AXIM_SERVICE_KEY"),
  };
}

/**
 * Read a claim from a JWT payload that has ALREADY been verified by
 * `supabase.auth.getUser()`. This decodes only; it must never be used as the
 * verification step, or a forged token would supply its own tenant.
 *
 * Returns undefined when the path is absent.
 */
export function claimFromToken(token: string, path: string): string | undefined {
  try {
    const payload = token.split(".")[1];
    if (!payload) return undefined;
    const normalised = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalised.padEnd(Math.ceil(normalised.length / 4) * 4, "=");
    const decoded = JSON.parse(atob(padded)) as Record<string, unknown>;
    let cursor: unknown = decoded;
    for (const segment of path.split(".")) {
      if (cursor === null || typeof cursor !== "object") return undefined;
      cursor = (cursor as Record<string, unknown>)[segment];
    }
    return typeof cursor === "string" && cursor.length > 0 ? cursor : undefined;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Versioned request signing with a date-keyed dual-accept window
// ---------------------------------------------------------------------------
//
// Signatures over the raw body alone are replayable forever: a captured request
// stays valid until the shared key rotates. The replacement signs
// `<timestamp>.<body>` and carries the timestamp in a header, so a receiver can
// reject anything stale.
//
// Rolling it out simultaneously across every signer is not safe, so both forms
// are accepted until a configured sunset date:
//
//   v2 (timestamped)  X-Axim-Signature-Version: 2
//                     X-Axim-Timestamp: <unix seconds>
//                     X-Axim-Signature: sha256=<hex HMAC(secret, "<ts>.<body>")>
//
//   legacy            X-Axim-Signature: sha256=<hex HMAC(secret, body)>
//
// After `SIGNATURE_LEGACY_SUNSET` the legacy form is refused, so the window
// closes by date rather than by a coordinated deploy.

export const SIGNATURE_V2 = "2";
export const SIGNATURE_MAX_SKEW_SECONDS = 300;
/** Default sunset for the body-only (legacy) signature form. */
export const DEFAULT_LEGACY_SUNSET = "2026-12-31T00:00:00Z";

export type SignatureMode = "v2" | "legacy" | "none";

export interface SignatureResult {
  ok: boolean;
  mode: SignatureMode;
  reason?: string;
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const buffer = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function normaliseSignature(raw: string | null): string | null {
  if (!raw) return null;
  const cleaned = raw.trim().replace(/^sha256=/i, "").toLowerCase();
  return /^[0-9a-f]{64}$/.test(cleaned) ? cleaned : null;
}

/**
 * Verify a signed request under the dual-accept policy.
 *
 * Pure apart from WebCrypto, so it can be unit tested without a server.
 */
export async function verifySignedRequest(params: {
  headers: Headers;
  rawBody: string;
  secret: string | undefined;
  nowMs?: number;
  legacySunset?: string;
}): Promise<SignatureResult> {
  const { headers, rawBody, secret } = params;
  const nowMs = params.nowMs ?? Date.now();
  const sunsetMs = Date.parse(params.legacySunset ?? DEFAULT_LEGACY_SUNSET);

  if (!secret) {
    return { ok: false, mode: "none", reason: "no signing secret configured" };
  }

  const rawSignature = headers.get("X-Axim-Signature") ?? headers.get("x-axim-signature");
  const signature = normaliseSignature(rawSignature);
  if (!rawSignature) return { ok: false, mode: "none", reason: "missing signature" };
  if (!signature) return { ok: false, mode: "none", reason: "malformed signature" };

  const rawTimestamp = headers.get("X-Axim-Timestamp") ?? headers.get("x-axim-timestamp");
  const version = (headers.get("X-Axim-Signature-Version") ??
    headers.get("x-axim-signature-version"))?.trim();

  // v2: timestamp is mandatory and part of the signed material.
  if (version === SIGNATURE_V2) {
    if (!rawTimestamp) {
      return { ok: false, mode: "v2", reason: "v2 signature requires X-Axim-Timestamp" };
    }
    const timestamp = Number.parseInt(rawTimestamp, 10);
    if (!Number.isFinite(timestamp)) {
      return { ok: false, mode: "v2", reason: "invalid timestamp" };
    }
    if (Math.abs(nowMs / 1000 - timestamp) > SIGNATURE_MAX_SKEW_SECONDS) {
      return { ok: false, mode: "v2", reason: "timestamp outside the 5 minute window" };
    }
    const expected = await hmacHex(secret, `${timestamp}.${rawBody}`);
    return timingSafeEqual(expected, signature)
      ? { ok: true, mode: "v2" }
      : { ok: false, mode: "v2", reason: "signature mismatch" };
  }

  // Legacy: body-only signature, accepted only until the sunset date.
  if (Number.isFinite(sunsetMs) && nowMs > sunsetMs) {
    return {
      ok: false,
      mode: "legacy",
      reason: `legacy signature form is retired (sunset ${new Date(sunsetMs).toISOString()})`,
    };
  }

  // If a legacy caller does supply a timestamp, honour it — free replay defence.
  if (rawTimestamp) {
    const timestamp = Number.parseInt(rawTimestamp, 10);
    if (Number.isFinite(timestamp) && Math.abs(nowMs / 1000 - timestamp) > SIGNATURE_MAX_SKEW_SECONDS) {
      return { ok: false, mode: "legacy", reason: "timestamp outside the 5 minute window" };
    }
  }

  const expected = await hmacHex(secret, rawBody);
  return timingSafeEqual(expected, signature)
    ? { ok: true, mode: "legacy" }
    : { ok: false, mode: "legacy", reason: "signature mismatch" };
}
