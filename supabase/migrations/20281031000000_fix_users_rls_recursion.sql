-- Fix: RLS infinite recursion on public.users (and every policy that reads it)
--
-- Symptom: any non-service_role query on public.users — or on any table whose
-- policy selects from public.users — fails with:
--     ERROR 42P17: infinite recursion detected in policy for relation "users"
--
-- Cause: the admin policy on public.users was
--     USING ((SELECT role FROM public.users WHERE id = auth.uid()) = 'admin')
-- i.e. a policy ON users that SELECTs FROM users. Evaluating it re-enters its
-- own policy, forever. Because service_role bypasses RLS, API smoke tests
-- passed while every anon/authenticated request (i.e. the real app) died.
--
-- Fix: move the admin lookup into a SECURITY DEFINER function. It runs with the
-- owner's privileges and therefore does not re-enter RLS, breaking the cycle.
-- All 26 affected policies are then rewritten to call it.

-- 1. Helper: is_admin() -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role = 'admin'::public.user_role
  );
$fn$;

COMMENT ON FUNCTION public.is_admin() IS
  'True when the caller is an authenticated admin. SECURITY DEFINER so RLS policies can reference it without recursing into public.users.';

GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated, service_role;

-- 2. Rewrite the recursive policies -------------------------------------------
-- Each policy below previously embedded
--     (SELECT ... FROM users WHERE id = auth.uid()) = 'admin'
-- and is replaced with public.is_admin().

-- users (the recursion origin)
DROP POLICY IF EXISTS "Allow admins full access" ON public.users;
CREATE POLICY "Allow admins full access" ON public.users
  FOR ALL USING (public.is_admin());

-- affiliate_partners (also allowed service_role — preserved)
DROP POLICY IF EXISTS "Allow full access to admins on affiliate_partners" ON public.affiliate_partners;
CREATE POLICY "Allow full access to admins on affiliate_partners" ON public.affiliate_partners
  FOR ALL USING (((auth.jwt() ->> 'role') = 'service_role') OR public.is_admin());

-- ai_interactions_ax2024
DROP POLICY IF EXISTS "Allow full access to admins" ON public.ai_interactions_ax2024;
CREATE POLICY "Allow full access to admins" ON public.ai_interactions_ax2024
  FOR ALL USING (public.is_admin());

-- ai_memory_banks
DROP POLICY IF EXISTS "Allow full access to admins on ai_memory_banks" ON public.ai_memory_banks;
CREATE POLICY "Allow full access to admins on ai_memory_banks" ON public.ai_memory_banks
  FOR ALL USING (public.is_admin());

-- api_call_logs_ax2024
DROP POLICY IF EXISTS "Allow full access to admins" ON public.api_call_logs_ax2024;
CREATE POLICY "Allow full access to admins" ON public.api_call_logs_ax2024
  FOR ALL USING (public.is_admin());

-- api_integrations_ax2024
DROP POLICY IF EXISTS "Allow full access to admins" ON public.api_integrations_ax2024;
CREATE POLICY "Allow full access to admins" ON public.api_integrations_ax2024
  FOR ALL USING (public.is_admin());

-- automation_logs_ax2024
DROP POLICY IF EXISTS "Allow full access to admins" ON public.automation_logs_ax2024;
CREATE POLICY "Allow full access to admins" ON public.automation_logs_ax2024
  FOR ALL USING (public.is_admin());

-- automations_ax2024
DROP POLICY IF EXISTS "Allow full access to admins" ON public.automations_ax2024;
CREATE POLICY "Allow full access to admins" ON public.automations_ax2024
  FOR ALL USING (public.is_admin());

-- contacts_ax2024
DROP POLICY IF EXISTS "Allow full access to admins" ON public.contacts_ax2024;
CREATE POLICY "Allow full access to admins" ON public.contacts_ax2024
  FOR ALL USING (public.is_admin());

-- dead_letter_jobs
DROP POLICY IF EXISTS "Admin access Dead Letter Jobs" ON public.dead_letter_jobs;
CREATE POLICY "Admin access Dead Letter Jobs" ON public.dead_letter_jobs
  FOR ALL USING (public.is_admin());

-- digital_products
DROP POLICY IF EXISTS "Allow all access on digital_products for admins" ON public.digital_products;
CREATE POLICY "Allow all access on digital_products for admins" ON public.digital_products
  FOR ALL USING (public.is_admin());

-- email_dead_letter_queue
DROP POLICY IF EXISTS "Admin access DLQ" ON public.email_dead_letter_queue;
CREATE POLICY "Admin access DLQ" ON public.email_dead_letter_queue
  FOR ALL USING (public.is_admin());

-- events_ax2024
DROP POLICY IF EXISTS "Allow full access to admins" ON public.events_ax2024;
CREATE POLICY "Allow full access to admins" ON public.events_ax2024
  FOR ALL USING (public.is_admin());

-- executive_knowledge_base (4 policies)
DROP POLICY IF EXISTS "Allow admins to view knowledge base" ON public.executive_knowledge_base;
CREATE POLICY "Allow admins to view knowledge base" ON public.executive_knowledge_base
  FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "Allow admins to insert into knowledge base" ON public.executive_knowledge_base;
CREATE POLICY "Allow admins to insert into knowledge base" ON public.executive_knowledge_base
  FOR INSERT WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Allow admins to update knowledge base" ON public.executive_knowledge_base;
CREATE POLICY "Allow admins to update knowledge base" ON public.executive_knowledge_base
  FOR UPDATE USING (public.is_admin());

DROP POLICY IF EXISTS "Allow admins to delete from knowledge base" ON public.executive_knowledge_base;
CREATE POLICY "Allow admins to delete from knowledge base" ON public.executive_knowledge_base
  FOR DELETE USING (public.is_admin());

-- generated_content_ax2024
DROP POLICY IF EXISTS "Allow full access to admins" ON public.generated_content_ax2024;
CREATE POLICY "Allow full access to admins" ON public.generated_content_ax2024
  FOR ALL USING (public.is_admin());

-- hitl_audit_logs (2 policies)
DROP POLICY IF EXISTS "Allow admins to view all hitl_audit_logs" ON public.hitl_audit_logs;
CREATE POLICY "Allow admins to view all hitl_audit_logs" ON public.hitl_audit_logs
  FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "Allow admins to insert hitl_audit_logs" ON public.hitl_audit_logs;
CREATE POLICY "Allow admins to insert hitl_audit_logs" ON public.hitl_audit_logs
  FOR INSERT WITH CHECK (public.is_admin());

-- memory_banks
DROP POLICY IF EXISTS "Allow full access to admins on memory_banks" ON public.memory_banks;
CREATE POLICY "Allow full access to admins on memory_banks" ON public.memory_banks
  FOR ALL USING (public.is_admin());

-- partner_credits
DROP POLICY IF EXISTS "Allow admins to manage credits" ON public.partner_credits;
CREATE POLICY "Allow admins to manage credits" ON public.partner_credits
  FOR ALL USING (public.is_admin());

-- product_deliveries
DROP POLICY IF EXISTS "Allow all access on product_deliveries for admins" ON public.product_deliveries;
CREATE POLICY "Allow all access on product_deliveries for admins" ON public.product_deliveries
  FOR ALL USING (public.is_admin());

-- projects_ax2024
DROP POLICY IF EXISTS "Allow full access to admins" ON public.projects_ax2024;
CREATE POLICY "Allow full access to admins" ON public.projects_ax2024
  FOR ALL USING (public.is_admin());

-- tasks_ax2024
DROP POLICY IF EXISTS "Allow full access to admins" ON public.tasks_ax2024;
CREATE POLICY "Allow full access to admins" ON public.tasks_ax2024
  FOR ALL USING (public.is_admin());

-- workflows_ax2024
DROP POLICY IF EXISTS "Allow full access to admins" ON public.workflows_ax2024;
CREATE POLICY "Allow full access to admins" ON public.workflows_ax2024
  FOR ALL USING (public.is_admin());
