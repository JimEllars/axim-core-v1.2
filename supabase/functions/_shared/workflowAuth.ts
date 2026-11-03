/**
 * Authorisation rules for workflow dispatch.
 *
 * `trigger-workflow` runs with the service role key: it reads any workflow,
 * executes its nodes and writes execution rows. `supabase/config.toml` sets
 * `verify_jwt = false` for it, so the platform does not check callers and the
 * function has to decide for itself. Until this module existed it decided
 * nothing — a POST with no `Authorization` header got a workflow run and an
 * execution row attributed to whatever `userId` the body claimed.
 *
 * Two rules, both fail-closed:
 *
 *   1. Anonymous callers are refused outright.
 *   2. A verified user may only act as themselves. Internal callers (satellites,
 *      cron, job-processor) may name the user they are acting for, because that
 *      is the whole point of a background job — but they must present a service
 *      key or a valid signature to do it.
 *
 * Caller *classification* lives in `edgeAuth.ts` (`resolveCaller` for bearer
 * credentials, `verifySignedRequest` for the v2/legacy HMAC forms). This module
 * only decides what a classified caller is allowed to do, so there is exactly
 * one place that reads headers and exactly one place that reads intent.
 *
 * Dependency-free so it can be unit tested under Node, like `edgeAuth.ts`.
 */

import type { CallerKind } from "./edgeAuth.ts";

export interface TriggerCaller {
  kind: CallerKind;
  userId: string | null;
}

export interface TriggerDecision {
  ok: boolean;
  /** 200 on success, 401 for an unauthenticated caller, 403 for a refused identity. */
  status: 200 | 401 | 403;
  /** The identity the run is attributed to. Null only for internal callers that name nobody. */
  actorId: string | null;
  reason?: string;
}

/** True for a caller that is allowed to dispatch workflows at all. */
export function authorizeTrigger(
  caller: TriggerCaller,
  requestedUserId?: string | null,
): TriggerDecision {
  const requested = typeof requestedUserId === "string" && requestedUserId.trim().length > 0
    ? requestedUserId.trim()
    : null;

  if (caller.kind === "anonymous") {
    return {
      ok: false,
      status: 401,
      actorId: null,
      reason: "authentication required: present a verified user token or the internal service key",
    };
  }

  // Internal callers are trusted to name the identity a background run belongs
  // to. The identity is still recorded on the execution row.
  if (caller.kind === "internal") {
    return { ok: true, status: 200, actorId: requested };
  }

  // Verified user. Their own id is the only identity they may claim.
  if (requested && requested !== caller.userId) {
    return {
      ok: false,
      status: 403,
      actorId: null,
      reason: "requested userId does not match the authenticated caller",
    };
  }

  return { ok: true, status: 200, actorId: caller.userId };
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Postgres `user_id` columns are UUIDs. Internal callers legitimately pass
 * sentinel values such as `"system"`, and `authorizeTrigger` returns them
 * verbatim because that is the right answer for *authorisation*. It is the
 * wrong value for the `workflow_execution_logs.user_id` column: inserting
 * `"system"` aborts the whole insert with `invalid input syntax for type uuid`,
 * which loses the audit row for a run that already executed.
 *
 * Coerce to null at the point of insert so the row is still persisted.
 */
export function coerceUuidOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return UUID_PATTERN.test(trimmed) ? trimmed : null;
}
