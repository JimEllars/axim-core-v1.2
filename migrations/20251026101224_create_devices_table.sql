-- 20251026101224_create_devices_table.sql

-- Create a new type for device status
CREATE TYPE device_status AS ENUM ('online', 'offline', 'busy');

-- Create the devices table
CREATE TABLE public.devices (
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

-- Add indexes
CREATE INDEX devices_user_id_idx ON public.devices USING btree (user_id);

-- Enable Row Level Security
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Allow users to see their own devices" ON public.devices
AS PERMISSIVE FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Allow users to insert their own devices" ON public.devices
AS PERMISSIVE FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Allow users to update their own devices" ON public.devices
AS PERMISSIVE FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Allow users to delete their own devices" ON public.devices
AS PERMISSIVE FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Add comments to the table and columns
COMMENT ON TABLE public.devices IS 'Stores information about user-registered devices for distributed resource allocation.';
COMMENT ON COLUMN public.devices.id IS 'Unique identifier for the device.';
COMMENT ON COLUMN public.devices.user_id IS 'Foreign key to the user who owns the device.';
COMMENT ON COLUMN public.devices.device_name IS 'A user-friendly name for the device.';
COMMENT ON COLUMN public.devices.system_info IS 'Stores system specifications like OS, CPU, RAM, etc.';
COMMENT ON COLUMN public.devices.status IS 'The current status of the device (online, offline, busy).';
COMMENT ON COLUMN public.devices.last_seen IS 'The last time a heartbeat was received from the device.';
COMMENT ON COLUMN public.devices.created_at IS 'The timestamp when the device was first registered.';
