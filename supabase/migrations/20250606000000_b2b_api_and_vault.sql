-- Create partner_credits table
CREATE TABLE IF NOT EXISTS partner_credits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    credits_remaining INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(partner_id)
);

ALTER TABLE partner_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow users to view their own credits" ON public.partner_credits FOR SELECT
  USING (auth.uid() = partner_id);

CREATE POLICY "Allow admins to manage credits" ON public.partner_credits FOR ALL
  USING ((SELECT role FROM public.users WHERE id = auth.uid()) = 'admin');

-- Create micro_app_transactions table if not exists
CREATE TABLE IF NOT EXISTS micro_app_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_identifier TEXT NOT NULL,
    product_id TEXT NOT NULL,
    amount_total INTEGER NOT NULL,
    stripe_session_id TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE micro_app_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow users to view their own transactions" ON public.micro_app_transactions FOR SELECT
  USING (user_identifier = auth.email() OR user_identifier = auth.uid()::text);
