-- Add definition column to workflows_ax2024 to store custom workflow steps
ALTER TABLE workflows_ax2024
ADD COLUMN IF NOT EXISTS definition JSONB;
