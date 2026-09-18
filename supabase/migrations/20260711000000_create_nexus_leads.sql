-- Create nexus_leads table
CREATE TABLE IF NOT EXISTS public.nexus_leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name TEXT,
    last_name TEXT,
    email TEXT,
    phone TEXT,
    company_name TEXT,
    website TEXT,
    target_vertical TEXT,
    lead_source TEXT,
    status TEXT,
    lead_score NUMERIC,
    ai_summary TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.nexus_leads ENABLE ROW LEVEL SECURITY;

-- Admin policies
CREATE POLICY "Enable read access for all users" ON public.nexus_leads FOR SELECT USING (true);
CREATE POLICY "Enable all access for admins" ON public.nexus_leads FOR ALL USING (auth.role() = 'service_role' OR auth.role() = 'authenticated');
