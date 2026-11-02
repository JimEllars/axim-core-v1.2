// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { authorizeTrigger } from '../supabase/functions/_shared/workflowAuth.ts';

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
