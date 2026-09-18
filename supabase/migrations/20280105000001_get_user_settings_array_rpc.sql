CREATE OR REPLACE FUNCTION public.get_user_settings_array()
RETURNS TABLE (settings jsonb) AS $$
BEGIN
    RETURN QUERY SELECT COALESCE(u.settings, '{}'::jsonb) FROM public.user_settings u WHERE user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
