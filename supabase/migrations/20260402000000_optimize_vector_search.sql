-- Add hnsw index to the embedding column on the ai_interactions_ax2024 table.
CREATE INDEX IF NOT EXISTS ai_interactions_embedding_idx ON public.ai_interactions_ax2024 USING hnsw (embedding vector_l2_ops);
