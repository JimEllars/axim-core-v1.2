-- Create Support System Baseline Tables
CREATE TYPE ticket_status AS ENUM ('open', 'pending', 'pending_user_verification', 'resolved', 'closed');

CREATE TABLE IF NOT EXISTS public.team_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT,
    avatar_url TEXT,
    department TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.support_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES public.contacts_ax2024(id) ON DELETE SET NULL,
    assignee_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    subject TEXT NOT NULL,
    description TEXT,
    priority TEXT DEFAULT 'Standard',
    status ticket_status DEFAULT 'open',
    app_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ticket_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
    sender_id UUID, -- Can be null for system messages
    content TEXT NOT NULL,
    is_internal BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ticket_ai_telemetry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
    confidence_score NUMERIC,
    tokens_used INTEGER,
    model_version TEXT,
    action_proposed TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.support_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_size INTEGER,
    storage_path TEXT NOT NULL,
    uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Note: hitl_audit_logs is already created in 20251101000000_create_hitl_audit_logs.sql
-- But we ensure the ticket_id column exists.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='hitl_audit_logs' AND column_name='ticket_id') THEN
      ALTER TABLE public.hitl_audit_logs ADD COLUMN ticket_id UUID REFERENCES public.support_tickets(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='hitl_audit_logs' AND column_name='status') THEN
      ALTER TABLE public.hitl_audit_logs ADD COLUMN status TEXT DEFAULT 'Pending';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='hitl_audit_logs' AND column_name='action_required') THEN
      ALTER TABLE public.hitl_audit_logs ADD COLUMN action_required TEXT;
  END IF;
END $$;

-- Enable RLS
ALTER TABLE public.team_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_ai_telemetry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_attachments ENABLE ROW LEVEL SECURITY;

-- Policies based on role claim
CREATE POLICY "Admins and Support can view team_profiles" ON public.team_profiles FOR SELECT
  USING (auth.jwt() ->> 'role' IN ('admin', 'support'));

CREATE POLICY "Admins and Support can view tickets" ON public.support_tickets FOR SELECT
  USING (auth.jwt() ->> 'role' IN ('admin', 'support'));
CREATE POLICY "Admins and Support can insert tickets" ON public.support_tickets FOR INSERT
  WITH CHECK (auth.jwt() ->> 'role' IN ('admin', 'support'));
CREATE POLICY "Admins and Support can update tickets" ON public.support_tickets FOR UPDATE
  USING (auth.jwt() ->> 'role' IN ('admin', 'support'));

CREATE POLICY "Admins and Support can view messages" ON public.ticket_messages FOR SELECT
  USING (auth.jwt() ->> 'role' IN ('admin', 'support'));
CREATE POLICY "Admins and Support can insert messages" ON public.ticket_messages FOR INSERT
  WITH CHECK (auth.jwt() ->> 'role' IN ('admin', 'support'));

CREATE POLICY "Admins and Support can view telemetry" ON public.ticket_ai_telemetry FOR SELECT
  USING (auth.jwt() ->> 'role' IN ('admin', 'support'));

CREATE POLICY "Admins and Support can view attachments" ON public.support_attachments FOR SELECT
  USING (auth.jwt() ->> 'role' IN ('admin', 'support'));

-- Support DB Schema baseline complete.
