#!/usr/bin/env python3
"""
Verify the RAG tenancy migration against a real Postgres.

Boots a throwaway cluster (pgserver bundles Postgres 16.2 + pgvector), builds the
pre-migration shape of memory_banks / executive_knowledge_base exactly as the
original migrations declared them, seeds two tenants' worth of data under a
single (pre-tenancy) schema, applies the migration verbatim, then asserts:

  * the backfill attributes pre-existing rows, and NOT NULL is enforced
  * both similarity functions require a tenant and reject a missing one
  * a call for tenant A never returns tenant B's rows
  * anon cannot execute them
  * existing rows stay reachable after the backfill

Usage: python3 verify_tenancy.py <migration.sql>
"""
import json
import os
import pathlib
import subprocess
import sys

import pgserver

PGDATA = "/tmp/pgscratch"
MIGRATION = pathlib.Path(sys.argv[1]).resolve()

PRE_SCHEMA = r"""
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE EXTENSION IF NOT EXISTS vector;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
-- auth.jwt() reads request.jwt.claims, which the test sets per session.
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

DO $$ BEGIN CREATE TYPE user_role AS ENUM ('admin', 'user', 'support');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.users (id uuid PRIMARY KEY, role user_role NOT NULL DEFAULT 'user');

CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
  SELECT EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin'::public.user_role);
$fn$;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;

INSERT INTO public.users (id, role) VALUES
  ('11111111-1111-1111-1111-111111111111', 'admin'),
  ('22222222-2222-2222-2222-222222222222', 'user');

-- --- pre-migration table shapes (exactly as originally declared) -------------
CREATE TABLE public.memory_banks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    summary_date DATE NOT NULL,
    executive_summary TEXT,
    key_decisions JSONB DEFAULT '[]'::jsonb,
    embedding vector(1536),
    created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.memory_banks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow full access to admins on memory_banks" ON public.memory_banks FOR ALL
  USING ((SELECT role FROM public.users WHERE id = auth.uid()) = 'admin');
CREATE INDEX memory_banks_summary_date_idx ON public.memory_banks (summary_date);
CREATE INDEX memory_banks_embedding_idx ON public.memory_banks USING hnsw (embedding vector_l2_ops);

CREATE TABLE public.executive_knowledge_base (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    content_chunk TEXT NOT NULL,
    embedding VECTOR(1536),
    source_type TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.executive_knowledge_base ENABLE ROW LEVEL SECURITY;

-- Supabase's default table grants (RLS is what actually scopes the rows).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.memory_banks TO authenticated;
GRANT SELECT ON public.memory_banks TO anon;
GRANT ALL ON public.memory_banks TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.executive_knowledge_base TO authenticated;
GRANT SELECT ON public.executive_knowledge_base TO anon;
GRANT ALL ON public.executive_knowledge_base TO service_role;
CREATE POLICY "Allow admins to view knowledge base" ON public.executive_knowledge_base FOR SELECT
  USING ((SELECT role FROM public.users WHERE id = auth.uid()) = 'admin');

-- pre-migration functions (3-arg, no tenant)
CREATE OR REPLACE FUNCTION public.match_memory_banks(
    query_embedding vector(1536), match_threshold float, match_count int
) RETURNS TABLE (id uuid, summary_date date, executive_summary text, key_decisions jsonb, similarity float)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY SELECT mb.id, mb.summary_date, mb.executive_summary, mb.key_decisions,
    1 - (mb.embedding <=> query_embedding) AS similarity
  FROM public.memory_banks mb
  WHERE 1 - (mb.embedding <=> query_embedding) > match_threshold
  ORDER BY mb.embedding <=> query_embedding LIMIT match_count;
END; $$;

CREATE OR REPLACE FUNCTION public.match_knowledge_base(
    query_embedding VECTOR(1536), match_threshold FLOAT, match_count INT
) RETURNS TABLE (id UUID, title TEXT, content_chunk TEXT, source_type TEXT, similarity FLOAT)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY SELECT ekb.id, ekb.title, ekb.content_chunk, ekb.source_type,
    1 - (ekb.embedding <=> query_embedding) AS similarity
  FROM executive_knowledge_base ekb
  WHERE 1 - (ekb.embedding <=> query_embedding) > match_threshold
  ORDER BY similarity DESC LIMIT match_count;
END; $$;

GRANT EXECUTE ON FUNCTION public.match_memory_banks(vector, float, int) TO anon;
GRANT EXECUTE ON FUNCTION public.match_knowledge_base(vector, float, int) TO anon;

-- --- pre-tenancy data: three rows, written before any tenant existed ---------
INSERT INTO public.memory_banks (summary_date, executive_summary, embedding) VALUES
  ('2026-10-01', 'legacy operator summary one', array_fill(0.02::real, ARRAY[1536])::vector);
INSERT INTO public.executive_knowledge_base (title, content_chunk, source_type, embedding) VALUES
  ('Legacy SOP', 'legacy operator directive', 'sop', array_fill(0.02::real, ARRAY[1536])::vector);
"""


def psql(psql_bin, uri, sql, verbose=False):
    body = ("\\set VERBOSITY verbose\n" if verbose else "") + sql
    return subprocess.run(
        [psql_bin, uri, "-v", "ON_ERROR_STOP=1", "-X", "-q", "-f", "-"],
        input=body, capture_output=True, text=True,
    )


def as_role(role, tenant=None, sub=None, statement=""):
    claims = {}
    if sub:
        claims["sub"] = sub
    if tenant:
        claims["app_metadata"] = {"tenant_id": tenant}
    parts = [f"SET ROLE {role};"]
    parts.append(f"SELECT set_config('request.jwt.claim.role', '{role}', false);")
    if sub:
        parts.append(f"SELECT set_config('request.jwt.claim.sub', '{sub}', false);")
    parts.append(
        f"SELECT set_config('request.jwt.claims', '{json.dumps(claims)}', false);"
    )
    parts.append(statement)
    return "\n".join(parts)


def main():
    srv = pgserver.get_server(PGDATA, cleanup_mode=None)
    uri = srv.get_uri()
    psql_bin = os.path.join(pathlib.Path(pgserver.__file__).parent, "pginstall", "bin", "psql")

    results = []

    def check(name, ok, detail=""):
        results.append((name, ok, detail))
        print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f"  [{detail}]" if detail and not ok else ""))

    psql(psql_bin, uri, "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;")
    r = psql(psql_bin, uri, PRE_SCHEMA)
    check("pre-migration schema: two tables, 3-arg functions, one legacy row each",
          r.returncode == 0, r.stderr[-500:])
    if r.returncode != 0:
        return finish(results)

    r = psql(psql_bin, uri, f"\\i {MIGRATION}")
    check("migration applies with ON_ERROR_STOP=1", r.returncode == 0, r.stderr[-700:])
    if r.returncode != 0:
        return finish(results)

    # --- schema shape -------------------------------------------------------
    r = psql(psql_bin, uri,
             "SELECT count(*) FROM public.tenants;", )
    check("four tenants seeded", "4" in r.stdout, r.stdout + r.stderr[-200:])

    r = psql(psql_bin, uri,
             "SELECT tenant_id FROM public.memory_banks;")
    check("legacy memory row backfilled to axim-systems", "axim-systems" in r.stdout, r.stdout)

    r = psql(psql_bin, uri,
             "SELECT tenant_id FROM public.executive_knowledge_base;")
    check("legacy knowledge row backfilled to axim-systems", "axim-systems" in r.stdout, r.stdout)

    r = psql(psql_bin, uri, verbose=True,
             sql=None) if False else psql(
        psql_bin, uri,
        "INSERT INTO public.memory_banks (summary_date, executive_summary) VALUES ('2026-10-02','no tenant');",
        verbose=True)
    check("NOT NULL on tenant_id is enforced", "23502" in r.stderr, r.stderr[-300:])

    r = psql(psql_bin, uri,
             "INSERT INTO public.memory_banks (summary_date, executive_summary, tenant_id) "
             "VALUES ('2026-10-02','bad tenant','not-a-tenant');", verbose=True)
    check("foreign key rejects an unknown tenant", "23503" in r.stderr, r.stderr[-300:])

    r = psql(psql_bin, uri,
             "SELECT indexdef FROM pg_indexes WHERE indexname='memory_banks_embedding_idx';")
    check("memory_banks vector index rebuilt with cosine ops",
          "vector_cosine_ops" in r.stdout, r.stdout)

    # --- seed a second tenant's data ---------------------------------------
    r = psql(psql_bin, uri, """
        INSERT INTO public.memory_banks (summary_date, executive_summary, tenant_id, embedding)
        VALUES ('2026-10-03','JK solar summary','jk-renewables', array_fill(0.02::real, ARRAY[1536])::vector);
        INSERT INTO public.executive_knowledge_base (title, content_chunk, source_type, tenant_id, embedding)
        VALUES ('JK SOP','JK directive','sop','jk-renewables', array_fill(0.02::real, ARRAY[1536])::vector);
    """)
    check("second tenant's rows seeded", r.returncode == 0, r.stderr[-300:])

    # --- function behaviour -------------------------------------------------
    embed = "array_fill(0.02::real, ARRAY[1536])::vector"

    r = psql(psql_bin, uri,
             f"SELECT executive_summary FROM public.match_memory_banks({embed}, 0.0, 10, 'axim-systems');")
    check("tenant A call returns only tenant A rows",
          "legacy operator summary one" in r.stdout and "JK solar" not in r.stdout, r.stdout)

    r = psql(psql_bin, uri,
             f"SELECT executive_summary FROM public.match_memory_banks({embed}, 0.0, 10, 'jk-renewables');")
    check("tenant B call returns only tenant B rows",
          "JK solar" in r.stdout and "legacy operator summary" not in r.stdout, r.stdout)

    r = psql(psql_bin, uri,
             f"SELECT content_chunk FROM public.match_knowledge_base({embed}, 0.0, 10, 'jk-renewables');")
    check("knowledge recall is tenant filters",
          "JK directive" in r.stdout and "legacy operator directive" not in r.stdout, r.stdout)

    r = psql(psql_bin, uri,
             f"SELECT * FROM public.match_memory_banks({embed}, 0.0, 10, NULL);", verbose=True)
    check("NULL tenant is rejected (22023)", "22023" in r.stderr, r.stderr[-300:])

    r = psql(psql_bin, uri,
             f"SELECT * FROM public.match_knowledge_base({embed}, 0.0, 10, '');", verbose=True)
    check("empty tenant is rejected (22023)", "22023" in r.stderr, r.stderr[-300:])

    r = psql(psql_bin, uri,
             f"SELECT * FROM public.match_memory_banks({embed}, 0.0, 10);", verbose=True)
    check("3-arg call no longer resolves (tenant is required)", "42P13" in r.stderr or "function" in r.stderr, r.stderr[-300:])

    # --- privileges ---------------------------------------------------------
    r = psql(psql_bin, uri, as_role("anon", statement=
             f"SELECT * FROM public.match_memory_banks({embed}, 0.0, 10, 'axim-systems');"),
             verbose=True)
    check("anon cannot execute match_memory_banks", "permission denied" in r.stderr, r.stderr[-300:])

    r = psql(psql_bin, uri, as_role(
        "authenticated", tenant="unifirst", sub="22222222-2222-2222-2222-222222222222",
        statement="SELECT 'COUNT=' || count(*) FROM public.memory_banks;"))
    check("RLS: a unifirst user sees no axim-systems or jk-renewables rows",
          "COUNT=0" in r.stdout, r.stdout[-300:] + r.stderr[-300:])

    r = psql(psql_bin, uri, as_role(
        "authenticated", tenant="jk-renewables", sub="22222222-2222-2222-2222-222222222222",
        statement="SELECT 'COUNT=' || count(*) FROM public.memory_banks;"))
    check("RLS: a jk-renewables user sees exactly its own row",
          "COUNT=1" in r.stdout, r.stdout[-300:])

    r = psql(psql_bin, uri, as_role(
        "authenticated", sub="11111111-1111-1111-1111-111111111111",
        statement="SELECT 'COUNT=' || count(*) FROM public.memory_banks;"))
    check("RLS: admin sees all rows", "COUNT=2" in r.stdout, r.stdout[-300:])

    return finish(results)


def finish(results):
    failed = [r for r in results if not r[1]]
    print()
    print(f"{len(results) - len(failed)}/{len(results)} checks passed")
    if failed:
        print("FAILURES:")
        for name, _, detail in failed:
            print(f"  - {name}: {detail}")
        sys.exit(1)
    print("tenancy migration verified against Postgres 16.2")


if __name__ == "__main__":
    main()
