/**
 * Reusable caller classification for Edge Functions.
 *
 * `trigger-workflow` grew a private `classifyCaller()` in Wave 128 because
 * `verify_jwt = false` meant the platform checked nothing and the function
 * checked nothing either. The four robotics functions need the same decision,
 * and three copies of an auth rule drift apart, so the rule lives here instead.
 *
 * Precedence, and why it is this order:
 *
 *   1. A **presented** `X-Axim-Signature` must verify. A bad signature is
 *      terminal — it never downgrades to a bearer-token check, because the
 *      caller already claimed to be a signed relay and got the HMAC wrong.
 *   2. Service keys (bearer or `X-Axim-Internal-Service-Key`) mean `internal`.
 *      An unset key never matches, so a missing env var fails closed.
 *   3. A bearer token that resolves to a user means `user`.
 *   4. Everything else is `anonymous`.
 *
 * `robotics.ts` / `edgeAuth.ts` supply the primitives; this module only decides
 * which one applies and in what order. No `Deno.*` access and every collaborator
 * is injected, so it is unit tested under Node.
 */

import {
  keysFromEnv,
  resolveCaller,
  verifySignedRequest,
  type CallerKeys,
  type CallerKind,
} from "./edgeAuth.ts";

export type CallerVia = "hmac:v2" | "hmac:legacy" | "internal_key" | "user_jwt" | "anonymous";

export interface ClassifiedCaller {
  kind: CallerKind;
  userId: string | null;
  via: CallerVia;
  /** Set when a signature was presented and refused, for logs only. */
  rejection?: string;
}

export interface ClassifyDeps {
  /** AXIM_INTERNAL_KEY. Absent means signed relays cannot be verified. */
  internalKey?: string;
  /** Service keys checked as bearer credentials. */
  keys?: CallerKeys;
  /** Validates a bearer token and returns the user id, or null. */
  verifyUser?: (token: string) => Promise<string | null>;
  /** Unix millis; injected for deterministic replay-window tests. */
  nowMs?: number;
  /** ISO date after which the body-only signature form is refused. */
  legacySunset?: string;
}

function readHeader(headers: Headers, name: string): string | null {
  return headers.get(name) ?? headers.get(name.toLowerCase());
}

/**
 * Classify a caller from the request headers and the exact bytes of the body.
 *
 * The body must be the *raw* text: an HMAC is computed over those bytes, so a
 * caller that parses first has nothing left to verify against.
 */
export async function classifyEdgeCaller(
  headers: Headers,
  rawBody: string,
  deps: ClassifyDeps = {},
): Promise<ClassifiedCaller> {
  const presentedSignature = readHeader(headers, "X-Axim-Signature");

  if (presentedSignature) {
    const verdict = await verifySignedRequest({
      headers,
      rawBody,
      secret: deps.internalKey,
      nowMs: deps.nowMs,
      legacySunset: deps.legacySunset,
    });

    if (!verdict.ok) {
      // Terminal: a caller that signed got it wrong. Falling through to the
      // bearer check here would let anyone bypass the signature requirement by
      // sending a junk header alongside a token.
      return {
        kind: "anonymous",
        userId: null,
        via: "anonymous",
        rejection: `signature ${verdict.mode}: ${verdict.reason}`,
      };
    }

    return {
      kind: "internal",
      userId: null,
      via: verdict.mode === "v2" ? "hmac:v2" : "hmac:legacy",
    };
  }

  const keys = deps.keys ?? { internalKey: deps.internalKey };
  const resolved = await resolveCaller(headers, keys, deps.verifyUser);

  if (resolved.kind === "internal") {
    return { kind: "internal", userId: null, via: "internal_key" };
  }
  if (resolved.kind === "user") {
    return { kind: "user", userId: resolved.userId, via: "user_jwt" };
  }

  return { kind: "anonymous", userId: null, via: "anonymous" };
}

/** True when the environment exposes the keys `classifyEdgeCaller` needs. */
export function classifyDepsFromEnv(env: { get(key: string): string | undefined }): ClassifyDeps {
  const key = env.get("AXIM_INTERNAL_KEY");
  return {
    internalKey: key && key.length > 0 ? key : undefined,
    keys: keysFromEnv(env),
  };
}

// ---------------------------------------------------------------------------
// Robotics authorisation
// ---------------------------------------------------------------------------

export type RoboticsOperation = "read" | "write" | "fleet_stop";

export interface RoboticsDecision {
  ok: boolean;
  /** 200 on success, 401 for an anonymous caller, 403 for a refused operation. */
  status: 200 | 401 | 403;
  actorId: string | null;
  reason?: string;
}

/**
 * Who may do what on the robotics surface.
 *
 * The robotics tables carry no tenant or owner column, so there is no per-user
 * scope to enforce — the meaningful line is authenticated versus not. What this
 * deliberately refuses:
 *
 *   - anonymous callers, on every operation, including the fleet stop. An
 *     unauthenticated halt endpoint is a denial-of-service switch.
 *   - a **user** caller draining the simulation queue. Draining dispatches work
 *     to an operator-configured simulator and mutates rows in bulk; it is a
 *     machine operation and belongs to cron or a satellite.
 */
export function authorizeRoboticsOperation(
  caller: { kind: CallerKind; userId: string | null },
  operation: RoboticsOperation,
): RoboticsDecision {
  if (caller.kind === "anonymous") {
    return {
      ok: false,
      status: 401,
      actorId: null,
      reason:
        "authentication required: present a verified user token, the internal service key, or a signed relay",
    };
  }

  // All three operator-facing operations have the same rule: any authenticated
  // caller may perform them. `operation` is kept in the signature so a future
  // per-operation scope (e.g. fleet_stop reserved for admins) has one place to
  // land instead of a new gate per function.
  void operation;
  return { ok: true, status: 200, actorId: caller.userId };
}

/**
 * Drain is internal-only. Kept separate from `authorizeRoboticsOperation` so the
 * rule that protects the queue consumer is visible on its own rather than buried
 * in a branch.
 */
export function authorizeQueueDrain(caller: {
  kind: CallerKind;
  userId: string | null;
}): RoboticsDecision {
  if (caller.kind === "internal") {
    return { ok: true, status: 200, actorId: null };
  }
  if (caller.kind === "user") {
    return {
      ok: false,
      status: 403,
      actorId: caller.userId,
      reason: "the simulation queue is drained by internal callers only",
    };
  }
  return {
    ok: false,
    status: 401,
    actorId: null,
    reason: "authentication required: present the internal service key or a signed relay",
  };
}
