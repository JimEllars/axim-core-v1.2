-- Add compressed flag to ai_interactions_ax2024
ALTER TABLE public.ai_interactions_ax2024 ADD COLUMN IF NOT EXISTS compressed BOOLEAN DEFAULT false;
