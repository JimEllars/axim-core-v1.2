CREATE OR REPLACE FUNCTION public.get_user_settings()
RETURNS jsonb AS $$
DECLARE
    v_settings jsonb;
BEGIN
    SELECT settings INTO v_settings FROM public.user_settings WHERE user_id = auth.uid();

    -- If no settings found, return an empty JSON object instead of null to prevent frontend crashes
    IF v_settings IS NULL THEN
        RETURN '{}'::jsonb;
    END IF;

    RETURN v_settings;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
