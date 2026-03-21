CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    service TEXT NOT NULL,
    api_key TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, service)
);

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow users to manage their own API keys"
ON api_keys
FOR ALL
USING (auth.uid() = user_id);

COMMENT ON TABLE api_keys IS 'Stores API keys for external services like OpenAI and Quest.';
COMMENT ON COLUMN api_keys.service IS 'The name of the service, e.g., ''openai'', ''quest''.';