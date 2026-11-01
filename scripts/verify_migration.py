#!/usr/bin/env python3
"""
Verify a migration against a real Postgres, not by reading it.

Boots a throwaway cluster (pgserver bundles Postgres 16 + pgvector), creates the
minimal Supabase-shaped surface the migration touches (roles, auth.uid(),
auth.jwt(), is_admin()), applies the migration file verbatim, then asserts both
permissions and behaviour.

Usage:
    python3 verify_migration.py <migration.sql>
"""
import json
import os
import subprocess
import sys
import pathlib

import pgserver

PGDATA = "/tmp/pgscratch"

# Supabase surface this migration depends on. Deliberately minimal: only the
# objects the SQL actually references.
SETUP_SQL = r"""
-- Supabase roles
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE EXTENSION IF NOT EXISTS vector;

-- Supabase grants these to the API roles by default; without USAGE every call
-- fails with "permission denied for schema public" before reaching the guard.
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
-- gen_random_uuid() is core in PG13+, no pgcrypto needed

-- auth.* stubs mirroring Supabase's implementations
CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

-- domain tables the migration touches
DO $$ BEGIN CREATE TYPE user_role AS ENUM ('admin', 'user', 'support');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY,
  role user_role NOT NULL DEFAULT 'user'
);

CREATE TABLE IF NOT EXISTS public.hitl_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text,
  status text NOT NULL DEFAULT 'pending',
  admin_id uuid
);

CREATE TABLE IF NOT EXISTS public.ecosystem_apps (
  app_id text PRIMARY KEY,
  is_active boolean NOT NULL DEFAULT true
);

-- is_admin() exactly as created by 20281031000000_fix_users_rls_recursion.sql
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role = 'admin'::public.user_role
  );
$fn$;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated, service_role;

-- seed: one admin, one ordinary user, one app, one pending HITL record
INSERT INTO public.users (id, role) VALUES
  ('11111111-1111-1111-1111-111111111111', 'admin'),
  ('22222222-2222-2222-2222-222222222222', 'user')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.ecosystem_apps (app_id, is_active)
VALUES ('speedreport', true)
ON CONFLICT (app_id) DO UPDATE SET is_active = true;

INSERT INTO public.hitl_audit_logs (id, action, status)
VALUES ('33333333-3333-3333-3333-333333333333', 'publish_article', 'pending')
ON CONFLICT (id) DO UPDATE SET status = 'pending';

-- a decoy unguarded function, to prove the migration actually drops it
CREATE OR REPLACE FUNCTION public.safe_sql_executor(query text) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE result json;
BEGIN EXECUTE 'SELECT json_agg(t) FROM (' || query || ') t' INTO result; RETURN result; END;
$$;
GRANT EXECUTE ON FUNCTION public.safe_sql_executor(text) TO anon;
"""

ADMIN_ID = "11111111-1111-1111-1111-111111111111"
USER_ID = "22222222-2222-2222-2222-222222222222"
LOG_ID = "33333333-3333-3333-3333-333333333333"


def run(psql_bin, uri, sql, expect_error=None):
    """Run SQL in a single session; return (stdout, stderr, returncode)."""
    # Feed SQL on stdin with \set VERBOSITY verbose so SQLSTATE codes appear in
    # stderr (psql omits them at the default verbosity).
    proc = subprocess.run(
        [psql_bin, uri, "-v", "ON_ERROR_STOP=1", "-X", "-q", "-f", "-"],
        input="\\set VERBOSITY verbose\n" + sql,
        capture_output=True,
        text=True,
    )
    out = (proc.stdout or "").strip()
    err = (proc.stderr or "").strip()
    if expect_error:
        ok = expect_error in err
        return ok, out, err
    return proc.returncode == 0, out, err


def as_role_sql(role, claims, statement):
    """A session that impersonates a Supabase caller."""
    parts = [
        f"SET ROLE {role};",
        f"SELECT set_config('request.jwt.claim.role', '{role}', false);",
    ]
    if claims:
        parts.append(f"SELECT set_config('request.jwt.claim.sub', '{claims}', false);")
        parts.append(
            f"SELECT set_config('request.jwt.claims', '{json.dumps({'sub': claims})}', false);"
        )
    parts.append(statement)
    return "\n".join(parts)


def main():
    migration = pathlib.Path(sys.argv[1]).resolve()
    if not migration.exists():
        sys.exit(f"no such migration: {migration}")

    srv = pgserver.get_server(PGDATA, cleanup_mode=None)
    uri = srv.get_uri()
    psql_bin = os.path.join(
        pathlib.Path(pgserver.__file__).parent, "pginstall", "bin", "psql"
    )

    results = []

    def check(name, ok, detail=""):
        results.append((name, ok, detail))
        print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f"  [{detail}]" if detail and not ok else ""))

    # --- fresh schema -------------------------------------------------------
    run(psql_bin, uri, "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;")
    ok, out, err = run(psql_bin, uri, SETUP_SQL)
    check("setup: Supabase-shaped fixture created", ok, err[-400:])
    if not ok:
        return report(results)

    ok, out, err = run(
        psql_bin, uri, "SELECT to_regprocedure('public.safe_sql_executor(text)') IS NOT NULL;"
    )
    check("precondition: decoy safe_sql_executor exists before the migration", "t" in out, out)

    # --- apply the migration VERBATIM --------------------------------------
    proc = subprocess.run(
        [psql_bin, uri, "-v", "ON_ERROR_STOP=1", "-X", "-q", "-f", str(migration)],
        capture_output=True,
        text=True,
    )
    check(
        "migration applies with ON_ERROR_STOP=1",
        proc.returncode == 0,
        (proc.stderr or "")[-600:],
    )
    if proc.returncode != 0:
        return report(results)

    # --- structural assertions ---------------------------------------------
    ok, out, _ = run(
        psql_bin, uri, "SELECT to_regprocedure('public.safe_sql_executor(text)') IS NULL;"
    )
    check("safe_sql_executor is gone", "t" in out, out)

    ok, out, _ = run(
        psql_bin, uri,
        "SELECT to_regprocedure('public.resolve_hitl_action(uuid,text,jsonb)') IS NOT NULL;",
    )
    check("resolve_hitl_action still exists with the same signature", "t" in out, out)

    ok, out, _ = run(
        psql_bin, uri,
        """SELECT has_function_privilege('anon',
             'public.resolve_hitl_action(uuid,text,jsonb)', 'EXECUTE');""",
    )
    check("anon has no EXECUTE on resolve_hitl_action", "f" in out, out)

    ok, out, _ = run(
        psql_bin, uri,
        """SELECT has_function_privilege('service_role',
             'public.resolve_hitl_action(uuid,text,jsonb)', 'EXECUTE');""",
    )
    check("service_role has EXECUTE", "t" in out, out)

    # --- behavioural assertions --------------------------------------------
    call = (
        f"SELECT public.resolve_hitl_action('{LOG_ID}', 'Approved', NULL);"
    )

    ok, out, err = run(
        psql_bin, uri, as_role_sql("anon", None, call), expect_error="permission denied"
    )
    check("anon cannot execute (permission denied)", ok, err[-300:])

    ok, out, err = run(
        psql_bin, uri, as_role_sql("authenticated", USER_ID, call), expect_error="42501"
    )
    check("non-admin authenticated caller is rejected (42501)", ok, err[-300:])

    ok, out, err = run(
        psql_bin, uri, as_role_sql("authenticated", ADMIN_ID, call)
    )
    check("admin caller succeeds", ok and "Approved" in out, out + err[-300:])

    ok, out, _ = run(
        psql_bin, uri,
        f"SELECT status FROM public.hitl_audit_logs WHERE id = '{LOG_ID}';",
    )
    check("admin decision was persisted", "Approved" in out, out)

    # service_role path — the resolve-hitl edge function
    run(
        psql_bin, uri,
        f"UPDATE public.hitl_audit_logs SET status = 'pending' WHERE id = '{LOG_ID}';",
    )
    ok, out, err = run(
        psql_bin, uri,
        as_role_sql(
            "service_role", None,
            f"SELECT public.resolve_hitl_action('{LOG_ID}', 'Approved', "
            f"'{{\"action\": \"quarantine_app\", \"target\": \"speedreport\"}}'::jsonb);",
        ),
    )
    check("service_role can approve", ok and "Approved" in out, (err or out)[-300:])

    ok, out, _ = run(
        psql_bin, uri,
        "SELECT is_active FROM public.ecosystem_apps WHERE app_id = 'speedreport';",
    )
    check("quarantine_app payload deactivated the app", "f" in out, out)

    # validation guards
    ok, out, err = run(
        psql_bin, uri,
        as_role_sql("service_role", None,
                    f"SELECT public.resolve_hitl_action('{LOG_ID}', 'Whatever', NULL);"),
        expect_error="22023",
    )
    check("invalid status is rejected (22023)", ok, err[-300:])

    ok, out, err = run(
        psql_bin, uri,
        as_role_sql("service_role", None,
                    "SELECT public.resolve_hitl_action("
                    "'44444444-4444-4444-4444-444444444444', 'Approved', NULL);"),
        expect_error="P0002",
    )
    check("unknown record raises P0002 instead of reporting success", ok, err[-300:])

    return report(results)


def report(results):
    failed = [r for r in results if not r[1]]
    print()
    print(f"{len(results) - len(failed)}/{len(results)} checks passed")
    if failed:
        print("FAILURES:")
        for name, _, detail in failed:
            print(f"  - {name}: {detail}")
        sys.exit(1)
    print("migration verified against Postgres 16.2")


if __name__ == "__main__":
    main()
