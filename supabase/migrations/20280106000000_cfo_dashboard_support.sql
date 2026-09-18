ALTER TABLE IF EXISTS public.hitl_audit_logs
ADD COLUMN IF NOT EXISTS target_department TEXT;

CREATE OR REPLACE FUNCTION public.get_cfo_pending_approvals()
RETURNS TABLE (
    id UUID,
    admin_id UUID,
    action TEXT,
    tool_called TEXT,
    "timestamp" TIMESTAMPTZ,
    ticket_id UUID,
    status TEXT,
    action_required TEXT,
    target_department TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT h.id, h.admin_id, h.action, h.tool_called, h.timestamp, h.ticket_id, h.status, h.action_required, h.target_department
    FROM public.hitl_audit_logs h
    WHERE h.target_department = 'CFO' AND h.status = 'Pending';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
