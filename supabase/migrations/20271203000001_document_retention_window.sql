-- Document retention window for compressed interactions
COMMENT ON COLUMN public.ai_interactions_ax2024.compressed IS 'Flags if this interaction has been compressed into the ai_memory_banks. Compressed interactions are retained indefinitely for raw embeddings retrieval.';
