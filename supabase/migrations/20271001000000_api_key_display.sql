-- Add display_key column to api_keys
ALTER TABLE public.api_keys
ADD COLUMN IF NOT EXISTS display_key TEXT;

-- Update existing keys with a masked version if necessary
UPDATE public.api_keys
SET display_key = CONCAT('****************', RIGHT(api_key, 4))
WHERE display_key IS NULL;
