-- Create custom access token hook function
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    claims jsonb;
    user_role text;
BEGIN
    -- Check if the user is marked as admin or support in app_metadata
    user_role := (event->'request'->'user'->'app_metadata'->>'role');

    claims := event->'claims';

    IF user_role IS NOT NULL THEN
        -- Set the custom claim
        claims := jsonb_set(claims, '{role}', to_jsonb(user_role));
    ELSE
        -- Default to 'user'
        claims := jsonb_set(claims, '{role}', '"user"');
    END IF;

    -- Update the 'claims' object in the original event
    event := jsonb_set(event, '{claims}', claims);

    -- Return the modified or original event
    RETURN event;
END;
$$;

-- Grant execution privileges
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;

-- For local development with Supabase CLI, we need to associate this hook
-- This part is usually done in supabase dashboard, but this is the database-level setup
