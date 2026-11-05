/**
 * Signed, stateless MCP sessions.
 *
 * The MCP SSE transport hands the client a session id at connect time and
 * expects that id back on every follow-up message. A Supabase Edge Function
 * cannot hold the session in memory — invocations are isolated and can land on
 * different instances — so the two options are a session table or a signed
 * token. This is the token: the id carries its own subject and expiry and the
 * HMAC makes it unforgeable, so `mcp-message` can validate a session with no
 * shared state and no extra table.
 *
 * Shape (dot-separated, base64url payload, hex signature):
 *
 *     v1.<base64url(JSON{id,sub,exp})>.<hex HMAC-SHA256(secret, "v1.<payload>")>
 *
 * The signature covers the version prefix as well, so a token cannot be
 * re-labelled into a future scheme by editing the first segment.
 *
 * An unset secret is a hard failure, not a downgrade: with no key we cannot tell
 * our own sessions from invented ones, so the entrypoints answer 503 rather than
 * issuing tokens that would later verify against nothing.
 */

import { timingSafeEqual } from "./edgeAuth.ts";

export const SESSION_VERSION = "v1";
export const DEFAULT_SESSION_TTL_SECONDS = 3600;
export const MAX_SESSION_TTL_SECONDS = 86_400;

export interface McpSession {
  /** Opaque session id, also the nonce. */
  id: string;
  /** Caller identity the session is bound to: a user id, or "internal". */
  subject: string;
  /** Unix seconds. */
  expiresAt: number;
}

export class SessionSecretMissingError extends Error {
  constructor() {
    super("AXIM_INTERNAL_KEY is not configured, so MCP sessions cannot be signed");
    this.name = "SessionSecretMissingError";
  }
}

export interface CreateSessionParams {
  secret: string | undefined;
  subject: string;
  nowMs?: number;
  ttlSeconds?: number;
  /** Injected in tests; otherwise random. */
  id?: string;
}

function base64UrlEncode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): string | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const normalised = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalised.padEnd(Math.ceil(normalised.length / 4) * 4, "=");
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
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

function clampTtl(ttlSeconds: number | undefined): number {
  if (typeof ttlSeconds !== "number" || !Number.isFinite(ttlSeconds)) {
    return DEFAULT_SESSION_TTL_SECONDS;
  }
  const floored = Math.floor(ttlSeconds);
  if (floored < 1) return 1;
  return Math.min(floored, MAX_SESSION_TTL_SECONDS);
}

function randomId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function createSession(
  params: CreateSessionParams,
): Promise<{ token: string; session: McpSession }> {
  const { secret, subject } = params;
  if (!secret) throw new SessionSecretMissingError();
  if (!subject || subject.trim().length === 0) {
    throw new Error("a session subject is required");
  }

  const nowMs = params.nowMs ?? Date.now();
  const session: McpSession = {
    id: params.id ?? randomId(),
    subject,
    expiresAt: Math.floor(nowMs / 1000) + clampTtl(params.ttlSeconds),
  };

  const payload = base64UrlEncode(JSON.stringify(session));
  const signingInput = `${SESSION_VERSION}.${payload}`;
  const signature = await hmacHex(secret, signingInput);
  return { token: `${signingInput}.${signature}`, session };
}

export type SessionCheck =
  | { ok: true; session: McpSession }
  | { ok: false; reason: string };

/**
 * Verify a session token.
 *
 * Order matters: signature first, then expiry. A token that fails the signature
 * check must never have its `exp` read, or a forged token with a far-future
 * expiry would short-circuit the check that rejects it.
 */
export async function verifySession(
  token: unknown,
  params: { secret: string | undefined; nowMs?: number },
): Promise<SessionCheck> {
  if (!params.secret) throw new SessionSecretMissingError();
  if (typeof token !== "string" || token.length === 0) {
    return { ok: false, reason: "missing session id" };
  }

  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed session id" };
  const [version, payload, signature] = parts;
  if (version !== SESSION_VERSION) {
    return { ok: false, reason: `unsupported session version: ${version}` };
  }

  const expected = await hmacHex(params.secret, `${version}.${payload}`);
  if (!timingSafeEqual(expected, signature)) {
    return { ok: false, reason: "session signature does not verify" };
  }

  const decoded = base64UrlDecode(payload);
  if (!decoded) return { ok: false, reason: "malformed session payload" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    return { ok: false, reason: "malformed session payload" };
  }

  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, reason: "malformed session payload" };
  }
  const candidate = parsed as Record<string, unknown>;
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.subject !== "string" ||
    typeof candidate.expiresAt !== "number" ||
    !Number.isFinite(candidate.expiresAt)
  ) {
    return { ok: false, reason: "session payload is missing id, subject or expiry" };
  }

  const nowSeconds = Math.floor((params.nowMs ?? Date.now()) / 1000);
  if (candidate.expiresAt <= nowSeconds) {
    return { ok: false, reason: "session expired" };
  }

  return {
    ok: true,
    session: {
      id: candidate.id,
      subject: candidate.subject,
      expiresAt: candidate.expiresAt,
    },
  };
}

/**
 * The subject a caller's identity maps to. A user caller is bound to their own
 * id; everything else shares the `internal` subject, and `mcp-message` refuses a
 * user-bound session presented by a non-user caller (and vice versa).
 */
export function subjectForCaller(caller: { kind: string; userId: string | null }): string {
  return caller.kind === "user" && caller.userId ? caller.userId : "internal";
}
