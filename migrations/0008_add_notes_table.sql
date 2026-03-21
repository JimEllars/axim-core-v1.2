-- Create the notes table
CREATE TABLE IF NOT EXISTS public.notes_ax2024 (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id uuid NOT NULL REFERENCES public.contacts_ax2024(id) ON DELETE CASCADE,
    content text NOT NULL,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz
);

-- Add an index on contact_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_notes_contact_id ON public.notes_ax2024(contact_id);

-- Use the existing timestamp trigger function
CREATE TRIGGER set_updated_at_notes
BEFORE UPDATE ON public.notes_ax2024
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

-- Enable Row Level Security
ALTER TABLE public.notes_ax2024 ENABLE ROW LEVEL SECURITY;

-- Create policy for authenticated users
CREATE POLICY "Allow all access to authenticated users"
ON public.notes_ax2024
FOR ALL
USING (auth.role() = 'authenticated');