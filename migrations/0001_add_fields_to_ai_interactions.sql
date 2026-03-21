-- This migration enhances the ai_interactions_ax2024 table to provide deeper insights into AI command usage.
-- It adds columns to distinguish between direct and LLM-routed commands, and to track which AI provider and model were used.
-- This additional data is crucial for debugging, performance analysis, and building a more robust long-term memory for the AI.

ALTER TABLE ai_interactions_ax2024
ADD COLUMN IF NOT EXISTS command_type TEXT,
ADD COLUMN IF NOT EXISTS llm_provider TEXT,
ADD COLUMN IF NOT EXISTS llm_model TEXT,
ADD COLUMN IF NOT EXISTS status TEXT;