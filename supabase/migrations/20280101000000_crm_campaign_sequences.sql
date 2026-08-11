-- Create crm_sequences table
CREATE TABLE IF NOT EXISTS public.crm_sequences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    steps JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Create crm_sequence_enrollments table
CREATE TABLE IF NOT EXISTS public.crm_sequence_enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES public.nexus_leads(id) ON DELETE CASCADE,
    sequence_id UUID NOT NULL REFERENCES public.crm_sequences(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed')),
    current_step INTEGER NOT NULL DEFAULT 0,
    enrolled_at TIMESTAMPTZ DEFAULT now(),
    last_processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.crm_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_sequence_enrollments ENABLE ROW LEVEL SECURITY;

-- Admin policies
CREATE POLICY "Enable read access for all users" ON public.crm_sequences FOR SELECT USING (true);
CREATE POLICY "Enable all access for admins" ON public.crm_sequences FOR ALL USING (auth.role() = 'service_role' OR auth.role() = 'authenticated');

CREATE POLICY "Enable read access for all users" ON public.crm_sequence_enrollments FOR SELECT USING (true);
CREATE POLICY "Enable all access for admins" ON public.crm_sequence_enrollments FOR ALL USING (auth.role() = 'service_role' OR auth.role() = 'authenticated');
