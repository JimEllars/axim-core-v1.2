// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { authorizeTrigger, coerceUuidOrNull } from '../supabase/functions/_shared/workflowAuth.ts';

/**
 * `trigger-workflow` runs with the service role key and `verify_jwt = false`,
 * so these rules are the only thing between an anonymous POST and a workflow
 * run recorded against someone else's identity.
 */

const anonymous = { kind: 'anonymous', userId: null };
const internal = { kind: 'internal', userId: null };
const user = { kind: 'user', userId: 'user-abc' };

describe('authorizeTrigger', () => {
  it('refuses an anonymous caller with 401', () => {
    const decision = authorizeTrigger(anonymous, undefined);
    expect(decision.ok).toBe(false);
    expect(decision.status).toBe(401);
    expect(decision.actorId).toBeNull();
    expect(decision.reason).toMatch(/authentication required/);
  });

  it('refuses an anonymous caller even when it names a user', () => {
    expect(authorizeTrigger(anonymous, 'user-abc').status).toBe(401);
  });

  it('lets an internal caller name the identity a background run belongs to', () => {
    const decision = authorizeTrigger(internal, 'user-abc');
    expect(decision).toEqual({ ok: true, status: 200, actorId: 'user-abc' });
  });

  it('lets an internal caller run without naming anyone', () => {
    expect(authorizeTrigger(internal, undefined)).toEqual({
      ok: true,
      status: 200,
      actorId: null,
    });
  });

  it('binds a verified user to their own identity when the body is silent', () => {
    expect(authorizeTrigger(user, undefined)).toEqual({
      ok: true,
      status: 200,
      actorId: 'user-abc',
    });
  });

  it('accepts a user naming their own id', () => {
    expect(authorizeTrigger(user, 'user-abc')).toEqual({
      ok: true,
      status: 200,
      actorId: 'user-abc',
    });
  });

  it('refuses a user claiming another identity, with 403', () => {
    const decision = authorizeTrigger(user, 'user-victim');
    expect(decision.ok).toBe(false);
    expect(decision.status).toBe(403);
    expect(decision.reason).toMatch(/does not match/);
  });

  it('refuses a user claiming to be the system actor', () => {
    expect(authorizeTrigger(user, 'system').status).toBe(403);
  });

  it('treats an empty or whitespace userId as absent rather than a claim', () => {
    expect(authorizeTrigger(user, '   ')).toEqual({ ok: true, status: 200, actorId: 'user-abc' });
    expect(authorizeTrigger(user, '')).toEqual({ ok: true, status: 200, actorId: 'user-abc' });
    expect(authorizeTrigger(user, null)).toEqual({ ok: true, status: 200, actorId: 'user-abc' });
  });

  it('trims the requested id before comparing', () => {
    expect(authorizeTrigger(user, ' user-abc ').actorId).toBe('user-abc');
  });

  it('ignores a non-string userId instead of trusting it', () => {
    expect(authorizeTrigger(user, 12345)).toEqual({ ok: true, status: 200, actorId: 'user-abc' });
    expect(authorizeTrigger(internal, { id: 'user-abc' }).actorId).toBeNull();
  });
});

/**
 * `authorizeTrigger` answers "who may act". It deliberately returns the claimed
 * identity verbatim for internal callers, sentinels included. The execution log
 * column, however, is a uuid: inserting "system" aborts the whole insert and
 * loses the audit row for a run that already executed. `coerceUuidOrNull` is the
 * boundary between those two facts.
 */
describe('coerceUuidOrNull', () => {
  const realId = '3f0d1c2a-4b5e-4f6a-8b9c-0d1e2f3a4b5c';

  it('passes a real uuid through unchanged', () => {
    expect(coerceUuidOrNull(realId)).toBe(realId);
  });

  it('upper-cases are still uuids', () => {
    expect(coerceUuidOrNull(realId.toUpperCase())).toBe(realId.toUpperCase());
  });

  it('drops the "system" sentinel internal callers legitimately send', () => {
    expect(coerceUuidOrNull('system')).toBeNull();
  });

  it('drops null, undefined, empty and non-string values', () => {
    expect(coerceUuidOrNull(null)).toBeNull();
    expect(coerceUuidOrNull(undefined)).toBeNull();
    expect(coerceUuidOrNull('')).toBeNull();
    expect(coerceUuidOrNull(12345)).toBeNull();
    expect(coerceUuidOrNull({ id: realId })).toBeNull();
  });

  it('rejects near-miss shapes rather than letting Postgres do it', () => {
    expect(coerceUuidOrNull(realId.replace(/-/g, ''))).toBeNull();
    expect(coerceUuidOrNull(`${realId}'; DROP TABLE leads; --`)).toBeNull();
    expect(coerceUuidOrNull('3f0d1c2a-4b5e-4f6a-8b9c-0d1e2f3a4b5')).toBeNull();
  });

  it('trims surrounding whitespace before matching', () => {
    expect(coerceUuidOrNull(`  ${realId}  `)).toBe(realId);
  });
});
