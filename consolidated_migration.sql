-- 1. Create device_status enum and devices table
DO $$ BEGIN
    CREATE TYPE device_status AS ENUM ('online', 'offline', 'maintenance');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS public.devices (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    device_name text NOT NULL,
    system_info jsonb NULL,
    status device_status NOT NULL DEFAULT 'offline'::device_status,
    last_seen timestamp with time zone NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT devices_pkey PRIMARY KEY (id),
    CONSTRAINT devices_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- 2. Create ecosystem_nodes table
CREATE TABLE IF NOT EXISTS public.ecosystem_nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_name TEXT NOT NULL,
    health_endpoint_url TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'operational',
    last_ping TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Create hitl_audit_logs table
CREATE TABLE IF NOT EXISTS hitl_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    tool_called TEXT,
    timestamp TIMESTAMPTZ DEFAULT now()
);

-- 4. Create api_usage_logs table
CREATE TABLE IF NOT EXISTS public.api_usage_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    api_key_id UUID REFERENCES public.api_keys(id) ON DELETE CASCADE,
    partner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Create telemetry_logs table
CREATE TABLE IF NOT EXISTS public.telemetry_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id TEXT,
    event TEXT NOT NULL,
    app_type TEXT,
    timestamp TIMESTAMPTZ DEFAULT now(),
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Add conversation_id to ai_interactions_ax2024
ALTER TABLE public.ai_interactions_ax2024 ADD COLUMN IF NOT EXISTS conversation_id UUID;

-- 7. Add user_roles if missing (assuming a simple table, though normally it's auth extensions or users roles)
-- Based on error "missing database tables... user_roles"
CREATE TABLE IF NOT EXISTS public.user_roles (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 8. Create secure_artifacts storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('secure_artifacts', 'secure_artifacts', false)
ON CONFLICT (id) DO NOTHING;

-- 9. Notify API to reload schema
NOTIFY pgrst, reload schema;
