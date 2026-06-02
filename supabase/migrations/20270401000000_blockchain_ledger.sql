-- Create the blockchain_transactions table
CREATE TABLE IF NOT EXISTS public.blockchain_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_id UUID REFERENCES auth.users(id),
    wallet_address TEXT NOT NULL,
    smart_contract_address TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    currency TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'minted', 'failed')),
    transaction_hash TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.blockchain_transactions ENABLE ROW LEVEL SECURITY;

-- Read access policies
CREATE POLICY "Users can read own blockchain transactions"
    ON public.blockchain_transactions
    FOR SELECT
    USING (auth.uid() = partner_id);

-- Restrict write access to service role ONLY
-- We just don't grant insert/update/delete to anon or authenticated
-- Supabase service_role bypasses RLS by default

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION public.set_current_timestamp_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update the updated_at timestamp
CREATE TRIGGER update_blockchain_transactions_updated_at
    BEFORE UPDATE ON public.blockchain_transactions
    FOR EACH ROW
    EXECUTE FUNCTION public.set_current_timestamp_updated_at();
