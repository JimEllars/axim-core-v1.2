-- Table: public.decipherment_volumes
CREATE TABLE IF NOT EXISTS public.decipherment_volumes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scan_name TEXT NOT NULL,
    beamline_source TEXT NOT NULL,
    energy_kev NUMERIC,
    voxel_size_microns NUMERIC NOT NULL,
    dimensions JSONB,
    storage_uri TEXT,
    status TEXT DEFAULT 'INGESTED',
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Table: public.decipherment_segments
CREATE TABLE IF NOT EXISTS public.decipherment_segments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    volume_id UUID REFERENCES public.decipherment_volumes(id) ON DELETE CASCADE,
    segment_label TEXT NOT NULL,
    arap_iterations INTEGER DEFAULT 100,
    flattened_tif_uri TEXT,
    ink_confidence_score NUMERIC DEFAULT 0.0,
    detected_characters TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_decipherment_segments_volume_id ON public.decipherment_segments(volume_id);
CREATE INDEX IF NOT EXISTS idx_decipherment_volumes_status ON public.decipherment_volumes(status);

ALTER TABLE public.decipherment_volumes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decipherment_segments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read decipherment volumes" ON public.decipherment_volumes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read decipherment segments" ON public.decipherment_segments FOR SELECT TO authenticated USING (true);
