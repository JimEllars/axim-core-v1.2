-- Add user_id and conversation_id to ai_interactions_ax2024 table
ALTER TABLE ai_interactions_ax2024 ADD COLUMN user_id UUID REFERENCES auth.users(id);
ALTER TABLE ai_interactions_ax2024 ADD COLUMN conversation_id UUID;

-- Drop the redundant ai_chat_history table
DROP TABLE IF EXISTS ai_chat_history;
