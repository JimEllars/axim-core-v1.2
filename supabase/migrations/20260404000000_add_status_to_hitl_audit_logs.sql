ALTER TABLE hitl_audit_logs ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Pending';
