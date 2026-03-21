-- Enable the pgvector extension to work with embedding vectors
create extension if not exists vector;

-- Add embedding column to ai_interactions_ax2024
alter table public.ai_interactions_ax2024 add column if not exists embedding vector(1536);

-- Create an index for faster similarity searches (using HNSW index which is recommended for pgvector)
create index if not exists ai_interactions_embedding_idx on public.ai_interactions_ax2024 using hnsw (embedding vector_cosine_ops);
