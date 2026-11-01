-- RAG tenancy: make Onyx memory strictly per-tenant.
--
-- Both recall tables had no tenant dimension at all, and their similarity
-- functions took no tenant argument:
--
--   public.match_memory_banks(vector, float, int)
--   public.match_knowledge_base(vector, float, int)
--
-- Every caller therefore saw every tenant's memory. AXiM operates across
-- distinct ventures (AXiM Systems, JK Renewables, UniFirst prospect research,
-- APF DAO) and cross-contamination between them is a correctness and a
-- confidentiality defect.
--
-- This migration adds the tenant dimension, backfills the existing rows to the
-- default tenant, and makes both functions *require* a tenant filter with no
-- default, so a caller cannot omit it and silently fall back to "everything".
--
-- Note on enforcement: the recall path runs through a service-role client, which
-- bypasses RLS. The tenant predicate inside the functions is therefore the
-- primary control, and RLS is the second layer for direct table access.

-- 1. Tenant registry ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tenants (
    id           TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.tenants IS
    'Ventures whose data must not mix. Referenced by memory_banks and executive_knowledge_base.';

INSERT INTO public.tenants (id, display_name) VALUES
    ('axim-systems',  'AXiM Systems'),
    ('jk-renewables', 'JK Renewables'),
    ('unifirst',      'UniFirst Prospect Research'),
    ('apf-dao',       'APF DAO')
ON CONFLICT (id) DO NOTHING;

-- 2. Columns, backfill, constraints -------------------------------------------
ALTER TABLE public.memory_banks
    ADD COLUMN IF NOT EXISTS tenant_id TEXT;

ALTER TABLE public.executive_knowledge_base
    ADD COLUMN IF NOT EXISTS tenant_id TEXT;

-- Existing rows predate tenancy and were written by the operator. Attribute them
-- to the default tenant rather than leaving them unowned (and therefore
-- unreachable) or guessing per row.
UPDATE public.memory_banks
   SET tenant_id = 'axim-systems'
 WHERE tenant_id IS NULL;

UPDATE public.executive_knowledge_base
   SET tenant_id = 'axim-systems'
 WHERE tenant_id IS NULL;

ALTER TABLE public.memory_banks
    ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE public.executive_knowledge_base
    ALTER COLUMN tenant_id SET NOT NULL;

-- Foreign keys, added only if absent (this migration may be re-run in dev).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'memory_banks_tenant_fk'
    ) THEN
        ALTER TABLE public.memory_banks
            ADD CONSTRAINT memory_banks_tenant_fk
            FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'executive_knowledge_base_tenant_fk'
    ) THEN
        ALTER TABLE public.executive_knowledge_base
            ADD CONSTRAINT executive_knowledge_base_tenant_fk
            FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);
    END IF;
END;
$$;

-- 3. Indexes ------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS memory_banks_tenant_idx
    ON public.memory_banks (tenant_id);

CREATE INDEX IF NOT EXISTS executive_knowledge_base_tenant_idx
    ON public.executive_knowledge_base (tenant_id);

-- The existing memory_banks vector index is HNSW with vector_l2_ops, but every
-- query uses the cosine operator (<=>), so it cannot serve them. Rebuild it with
-- the matching ops class, and give executive_knowledge_base an index it never had.
DROP INDEX IF EXISTS public.memory_banks_embedding_idx;
CREATE INDEX memory_banks_embedding_idx
    ON public.memory_banks USING hnsw (embedding vector_cosine_ops);

DROP INDEX IF EXISTS public.executive_knowledge_base_embedding_idx;
CREATE INDEX executive_knowledge_base_embedding_idx
    ON public.executive_knowledge_base USING hnsw (embedding vector_cosine_ops);

-- 4. Tenant resolution helper -------------------------------------------------
-- SECURITY DEFINER with a pinned search_path for the same reason is_admin() is:
-- it is called from RLS policies, and a policy must not depend on the calling
-- role holding USAGE on the auth schema. It reads JWT claims only — no table
-- access — so definer rights grant nothing beyond that.
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT coalesce(
        auth.jwt() -> 'app_metadata' ->> 'tenant_id',
        auth.jwt() ->> 'tenant_id'
    )
$$;

GRANT EXECUTE ON FUNCTION public.current_tenant_id() TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.current_tenant_id() IS
    'Tenant claim from the caller JWT (app_metadata.tenant_id, else tenant_id). NULL when absent.';

-- 5. RLS: tenant-scoped, with an admin override -------------------------------
DROP POLICY IF EXISTS "Allow full access to admins on memory_banks" ON public.memory_banks;
DROP POLICY IF EXISTS "Tenant read on memory_banks" ON public.memory_banks;
DROP POLICY IF EXISTS "Service role full access on memory_banks" ON public.memory_banks;

CREATE POLICY "Tenant read on memory_banks" ON public.memory_banks
    FOR SELECT TO authenticated
    USING (tenant_id = public.current_tenant_id() OR public.is_admin());

CREATE POLICY "Service role full access on memory_banks" ON public.memory_banks
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow admins to view knowledge base" ON public.executive_knowledge_base;
DROP POLICY IF EXISTS "Allow admins to insert into knowledge base" ON public.executive_knowledge_base;
DROP POLICY IF EXISTS "Allow admins to update knowledge base" ON public.executive_knowledge_base;
DROP POLICY IF EXISTS "Allow admins to delete from knowledge base" ON public.executive_knowledge_base;
DROP POLICY IF EXISTS "Tenant access on executive_knowledge_base" ON public.executive_knowledge_base;
DROP POLICY IF EXISTS "Service role full access on executive_knowledge_base" ON public.executive_knowledge_base;

CREATE POLICY "Tenant access on executive_knowledge_base" ON public.executive_knowledge_base
    FOR ALL TO authenticated
    USING (tenant_id = public.current_tenant_id() OR public.is_admin())
    WITH CHECK (tenant_id = public.current_tenant_id() OR public.is_admin());

CREATE POLICY "Service role full access on executive_knowledge_base" ON public.executive_knowledge_base
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- 6. Similarity functions require a tenant ------------------------------------
-- Drop before create: CREATE OR REPLACE with a different signature creates an
-- overload rather than replacing, which is how this repo previously ended up
-- with two match_ai_interactions variants and an ambiguous call.
DROP FUNCTION IF EXISTS public.match_memory_banks(vector, double precision, integer);
DROP FUNCTION IF EXISTS public.match_knowledge_base(vector, double precision, integer);

CREATE FUNCTION public.match_memory_banks(
    query_embedding vector(1536),
    match_threshold double precision,
    match_count integer,
    p_tenant_id text
)
RETURNS TABLE (
    id uuid,
    tenant_id text,
    summary_date date,
    executive_summary text,
    key_decisions jsonb,
    similarity double precision
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    IF p_tenant_id IS NULL OR length(p_tenant_id) = 0 THEN
        RAISE EXCEPTION 'match_memory_banks requires p_tenant_id'
            USING ERRCODE = '22023';
    END IF;

    RETURN QUERY
    SELECT
        mb.id,
        mb.tenant_id,
        mb.summary_date,
        mb.executive_summary,
        mb.key_decisions,
        (1 - (mb.embedding <=> query_embedding))::double precision AS similarity
    FROM public.memory_banks mb
    WHERE mb.tenant_id = p_tenant_id
      AND mb.embedding IS NOT NULL
      AND 1 - (mb.embedding <=> query_embedding) > match_threshold
    ORDER BY mb.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

CREATE FUNCTION public.match_knowledge_base(
    query_embedding vector(1536),
    match_threshold double precision,
    match_count integer,
    p_tenant_id text
)
RETURNS TABLE (
    id uuid,
    tenant_id text,
    title text,
    content_chunk text,
    source_type text,
    similarity double precision
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    IF p_tenant_id IS NULL OR length(p_tenant_id) = 0 THEN
        RAISE EXCEPTION 'match_knowledge_base requires p_tenant_id'
            USING ERRCODE = '22023';
    END IF;

    RETURN QUERY
    SELECT
        ekb.id,
        ekb.tenant_id,
        ekb.title,
        ekb.content_chunk,
        ekb.source_type,
        (1 - (ekb.embedding <=> query_embedding))::double precision AS similarity
    FROM public.executive_knowledge_base ekb
    WHERE ekb.tenant_id = p_tenant_id
      AND ekb.embedding IS NOT NULL
      AND 1 - (ekb.embedding <=> query_embedding) > match_threshold
    ORDER BY ekb.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

COMMENT ON FUNCTION public.match_memory_banks(vector, double precision, integer, text) IS
    'Tenant-scoped memory recall. p_tenant_id is required; there is no all-tenant fallback.';

COMMENT ON FUNCTION public.match_knowledge_base(vector, double precision, integer, text) IS
    'Tenant-scoped knowledge recall. p_tenant_id is required; there is no all-tenant fallback.';

-- 7. Privileges ---------------------------------------------------------------
-- These were executable by anon by default (Postgres grants EXECUTE to PUBLIC).
REVOKE ALL ON FUNCTION public.match_memory_banks(vector, double precision, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.match_memory_banks(vector, double precision, integer, text) FROM anon;
REVOKE ALL ON FUNCTION public.match_knowledge_base(vector, double precision, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.match_knowledge_base(vector, double precision, integer, text) FROM anon;

GRANT EXECUTE ON FUNCTION public.match_memory_banks(vector, double precision, integer, text)
    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.match_knowledge_base(vector, double precision, integer, text)
    TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenants TO service_role;
GRANT SELECT ON public.tenants TO authenticated;
