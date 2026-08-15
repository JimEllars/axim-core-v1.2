CREATE TABLE IF NOT EXISTS public.devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    device_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, device_id)
);

ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow users to see their own devices" ON public.devices;
CREATE POLICY "Allow users to see their own devices" ON public.devices FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Allow users to insert their own devices" ON public.devices;
CREATE POLICY "Allow users to insert their own devices" ON public.devices FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Allow users to update their own devices" ON public.devices;
CREATE POLICY "Allow users to update their own devices" ON public.devices FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Allow users to delete their own devices" ON public.devices;
CREATE POLICY "Allow users to delete their own devices" ON public.devices FOR DELETE
  USING (auth.uid() = user_id);
