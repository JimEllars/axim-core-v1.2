CREATE TABLE IF NOT EXISTS ecosystem_apps (
    app_id TEXT PRIMARY KEY,
    is_active BOOLEAN DEFAULT true,
    status TEXT
);

ALTER TABLE ecosystem_apps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read access to ecosystem_apps" ON public.ecosystem_apps FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow service role full access to ecosystem_apps" ON public.ecosystem_apps
  USING (true)
  WITH CHECK (true);
