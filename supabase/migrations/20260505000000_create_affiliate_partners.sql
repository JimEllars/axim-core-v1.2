-- Create affiliate_partners table
CREATE TABLE IF NOT EXISTS public.affiliate_partners (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_name VARCHAR(255) NOT NULL,
    category VARCHAR(255) NOT NULL,
    custom_link TEXT NOT NULL,
    context_description TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.affiliate_partners ENABLE ROW LEVEL SECURITY;

-- Allow full access to admins
CREATE POLICY "Allow full access to admins on affiliate_partners" ON public.affiliate_partners FOR ALL
  USING (
    auth.jwt() ->> 'role' = 'service_role' OR
    (SELECT role FROM public.users WHERE id = auth.uid()) = 'admin'
  )
  WITH CHECK (
    auth.jwt() ->> 'role' = 'service_role' OR
    (SELECT role FROM public.users WHERE id = auth.uid()) = 'admin'
  );

-- Allow service role access (if not already handled by JWT policy, though typically supabase handles service role globally)
-- CREATE POLICY "Service Role Only" ON public.affiliate_partners
--     FOR ALL
--     TO service_role
--     USING (true)
--     WITH CHECK (true);

-- Seed Data
INSERT INTO public.affiliate_partners (partner_name, category, custom_link, context_description, status)
VALUES (
    'beehiiv',
    'email_newsletter',
    'https://www.beehiiv.com?via=James-Ellars',
    'A modern, high-deliverability email newsletter platform built for growth and monetization.',
    'active'
);
