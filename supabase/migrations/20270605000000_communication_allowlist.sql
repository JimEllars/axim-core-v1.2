-- Create a SQL migration establishing a communication_allowlist table
CREATE TABLE IF NOT EXISTS public.communication_allowlist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email_address TEXT UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed the schema with our defined target records
INSERT INTO public.communication_allowlist (email_address, description) VALUES
('jrellars@gmail.com', 'Admin personal'),
('james.ellars@axim.us.com', 'Admin corporate'),
('agent@e7byynw7a3.chatbase-mail.com', 'Chatbase agent facade')
ON CONFLICT (email_address) DO NOTHING;
