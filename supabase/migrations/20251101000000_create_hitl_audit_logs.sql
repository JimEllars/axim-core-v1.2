CREATE TABLE IF NOT EXISTS hitl_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    tool_called TEXT,
    timestamp TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE hitl_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow admins to view all hitl_audit_logs" ON public.hitl_audit_logs FOR SELECT
  USING ((SELECT role FROM public.users WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Allow admins to insert hitl_audit_logs" ON public.hitl_audit_logs FOR INSERT
  WITH CHECK ((SELECT role FROM public.users WHERE id = auth.uid()) = 'admin');
