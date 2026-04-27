-- Phase 25: Secure Vault Integration (supabase/migrations/)
-- We must securely store the new API key in our centralized vault.

INSERT INTO public.ecosystem_connections (service_name, webhook_url, api_key, status)
VALUES (
    'emailit',
    'https://api.emailit.com/v1/emails',
    'secret_XYo6iM9WGHIZhxmC4qz2Wk8EEl7lQ05o',
    'active'
)
ON CONFLICT (service_name) DO UPDATE SET
    webhook_url = EXCLUDED.webhook_url,
    api_key = EXCLUDED.api_key,
    status = EXCLUDED.status;
