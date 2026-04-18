CREATE TABLE IF NOT EXISTS partner_webhooks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    partner_id UUID REFERENCES users(id) ON DELETE CASCADE,
    endpoint_url TEXT NOT NULL,
    secret_key TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add updated_at trigger
CREATE TRIGGER update_partner_webhooks_updated_at
BEFORE UPDATE ON partner_webhooks
FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- Add RLS policies (e.g. users can manage their own webhooks, admins manage all)
ALTER TABLE partner_webhooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own webhooks" ON partner_webhooks
    FOR SELECT USING (auth.uid() = partner_id);

CREATE POLICY "Users can insert their own webhooks" ON partner_webhooks
    FOR INSERT WITH CHECK (auth.uid() = partner_id);

CREATE POLICY "Users can update their own webhooks" ON partner_webhooks
    FOR UPDATE USING (auth.uid() = partner_id);

CREATE POLICY "Users can delete their own webhooks" ON partner_webhooks
    FOR DELETE USING (auth.uid() = partner_id);
