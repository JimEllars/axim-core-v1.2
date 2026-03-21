CREATE TABLE IF NOT EXISTS public.contacts_ax2024 (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name character varying(255) NOT NULL,
    email character varying(255) NOT NULL UNIQUE,
    source character varying(100),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz
);

-- Re-using the timestamp trigger function from the previous migration
CREATE TRIGGER set_updated_at_contacts
BEFORE UPDATE ON public.contacts_ax2024
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

ALTER TABLE public.contacts_ax2024 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to authenticated users"
ON public.contacts_ax2024
FOR ALL
USING (auth.role() = 'authenticated');