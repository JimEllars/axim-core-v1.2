-- Reconcile missing elements from deprecated migrations/ folder
-- Workstream A

-- Make sure ai_interactions_ax2024 has the right columns from 0001_add_fields_to_ai_interactions.sql
ALTER TABLE public.ai_interactions_ax2024 ADD COLUMN IF NOT EXISTS command_type VARCHAR(50);
ALTER TABLE public.ai_interactions_ax2024 ADD COLUMN IF NOT EXISTS llm_provider VARCHAR(50);
ALTER TABLE public.ai_interactions_ax2024 ADD COLUMN IF NOT EXISTS llm_model VARCHAR(100);
ALTER TABLE public.ai_interactions_ax2024 ADD COLUMN IF NOT EXISTS execution_time_ms INTEGER;

-- Make sure user_id and conversation_id exist from 20251026012115_unify_ai_logging.sql
ALTER TABLE public.ai_interactions_ax2024 ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE public.ai_interactions_ax2024 ADD COLUMN IF NOT EXISTS conversation_id UUID;

-- Note: The `embedding vector(1536)` column is explicitly established in 20261201000000_add_vector_embeddings.sql
-- It has been stripped from here to ensure duplicate idempotent conflicts don't occur across Supabase pushes.

-- user_settings
CREATE TABLE IF NOT EXISTS public.user_settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    settings jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view and edit their own settings" ON public.user_settings;
CREATE POLICY "Users can view and edit their own settings" ON public.user_settings FOR ALL USING (auth.uid() = user_id);

-- notes_ax2024
CREATE TABLE IF NOT EXISTS public.notes_ax2024 (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id uuid NOT NULL REFERENCES public.contacts_ax2024(id) ON DELETE CASCADE,
    content text NOT NULL,
    created_at timestamptz DEFAULT now()
);
ALTER TABLE public.notes_ax2024 ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow users to view own notes" ON public.notes_ax2024;
CREATE POLICY "Allow users to view own notes" ON public.notes_ax2024 FOR ALL USING (
    EXISTS (SELECT 1 FROM public.contacts_ax2024 c WHERE c.id = notes_ax2024.contact_id AND c.user_id = auth.uid())
);

-- safe_sql_executor (20241018192402_safe_sql_executor.sql)
CREATE OR REPLACE FUNCTION public.safe_sql_executor(query text)
RETURNS json AS $$
DECLARE
    result json;
BEGIN
    EXECUTE 'SELECT json_agg(t) FROM (' || query || ') t' INTO result;
    RETURN result;
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Make sure search_chat_history exists
CREATE OR REPLACE FUNCTION public.search_chat_history(query_text TEXT)
RETURNS TABLE (
    command TEXT,
    response TEXT,
    created_at TIMESTAMPTZ,
    command_type VARCHAR(50),
    llm_provider VARCHAR(50),
    llm_model VARCHAR(100)
)
LANGUAGE sql STABLE
AS $$
  SELECT command, response, created_at, command_type, llm_provider, llm_model
  FROM ai_interactions_ax2024
  WHERE command ILIKE '%' || query_text || '%' OR response ILIKE '%' || query_text || '%'
  ORDER BY created_at DESC;
$$;
