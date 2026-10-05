-- Create migration for Volumetric Decipherment Ingress Schema
CREATE TABLE IF NOT EXISTS public.decipherment_volumes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scan_name TEXT NOT NULL,
    beamline_source TEXT NOT NULL,
    energy_kev NUMERIC,
    voxel_size_microns NUMERIC,
    dimensions JSONB,
    storage_uri TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.decipherment_segments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    volume_id UUID NOT NULL REFERENCES public.decipherment_volumes(id) ON DELETE CASCADE,
    segment_label TEXT NOT NULL,
    arap_iterations INTEGER,
    flattened_tif_uri TEXT,
    ink_confidence_score NUMERIC,
    detected_characters TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.decipherment_volumes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decipherment_segments ENABLE ROW LEVEL SECURITY;

-- Create Policies
-- Read access for authenticated users
CREATE POLICY decipherment_volumes_read_auth ON public.decipherment_volumes
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY decipherment_segments_read_auth ON public.decipherment_segments
    FOR SELECT
    TO authenticated
    USING (true);

-- Write access restricted to service-role or super_user
CREATE POLICY decipherment_volumes_write_restricted ON public.decipherment_volumes
    FOR INSERT
    WITH CHECK (
        auth.role() = 'service_role' OR
        (auth.jwt() ->> 'role' = 'super_user') OR
        (auth.jwt() ->> 'email' = 'james.ellars@axim.us.com') OR
        (auth.jwt() ->> 'email' = 'jrellars@gmail.com')
    );

CREATE POLICY decipherment_segments_write_restricted ON public.decipherment_segments
    FOR INSERT
    WITH CHECK (
        auth.role() = 'service_role' OR
        (auth.jwt() ->> 'role' = 'super_user') OR
        (auth.jwt() ->> 'email' = 'james.ellars@axim.us.com') OR
        (auth.jwt() ->> 'email' = 'jrellars@gmail.com')
    );
