ALTER TABLE IF EXISTS public.hitl_audit_logs
ADD COLUMN IF NOT EXISTS action_required TEXT;
