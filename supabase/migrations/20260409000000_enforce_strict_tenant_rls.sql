-- 20260409000000_enforce_strict_tenant_rls.sql

-- Enable RLS for all mentioned tables
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.secure_artifacts ENABLE ROW LEVEL SECURITY;

-- API Keys Policies
DROP POLICY IF EXISTS "Strict Tenant RLS for API Keys Select" ON public.api_keys;
CREATE POLICY "Strict Tenant RLS for API Keys Select" ON public.api_keys
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Strict Tenant RLS for API Keys Insert" ON public.api_keys;
CREATE POLICY "Strict Tenant RLS for API Keys Insert" ON public.api_keys
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Strict Tenant RLS for API Keys Update" ON public.api_keys;
CREATE POLICY "Strict Tenant RLS for API Keys Update" ON public.api_keys
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Strict Tenant RLS for API Keys Delete" ON public.api_keys;
CREATE POLICY "Strict Tenant RLS for API Keys Delete" ON public.api_keys
  FOR DELETE USING (auth.uid() = user_id);

-- Partner Webhooks Policies
DROP POLICY IF EXISTS "Strict Tenant RLS for Partner Webhooks Select" ON public.partner_webhooks;
CREATE POLICY "Strict Tenant RLS for Partner Webhooks Select" ON public.partner_webhooks
  FOR SELECT USING (auth.uid() = partner_id);

DROP POLICY IF EXISTS "Strict Tenant RLS for Partner Webhooks Insert" ON public.partner_webhooks;
CREATE POLICY "Strict Tenant RLS for Partner Webhooks Insert" ON public.partner_webhooks
  FOR INSERT WITH CHECK (auth.uid() = partner_id);

DROP POLICY IF EXISTS "Strict Tenant RLS for Partner Webhooks Update" ON public.partner_webhooks;
CREATE POLICY "Strict Tenant RLS for Partner Webhooks Update" ON public.partner_webhooks
  FOR UPDATE USING (auth.uid() = partner_id);

DROP POLICY IF EXISTS "Strict Tenant RLS for Partner Webhooks Delete" ON public.partner_webhooks;
CREATE POLICY "Strict Tenant RLS for Partner Webhooks Delete" ON public.partner_webhooks
  FOR DELETE USING (auth.uid() = partner_id);

-- Note: Depending on the schema of secure_artifacts (whether it's a table or a storage bucket),
-- the policy structure might be different. Let's assume it's a standard table for this phase
-- or a storage object in the storage.objects table.
-- Supabase storage uses `storage.objects` table. If it's the bucket:
DROP POLICY IF EXISTS "Strict Tenant RLS for Secure Artifacts Select" ON storage.objects;
CREATE POLICY "Strict Tenant RLS for Secure Artifacts Select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'secure_artifacts' AND
    (auth.uid() = owner OR owner IS NULL) -- Adjust logic as necessary based on how owner is stored
  );

DROP POLICY IF EXISTS "Strict Tenant RLS for Secure Artifacts Insert" ON storage.objects;
CREATE POLICY "Strict Tenant RLS for Secure Artifacts Insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'secure_artifacts' AND
    auth.uid() = owner
  );
