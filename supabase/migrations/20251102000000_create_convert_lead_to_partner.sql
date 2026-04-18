-- Add is_partner column to users table if it doesn't exist
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS is_partner BOOLEAN DEFAULT false;

-- Create the convert_lead_to_partner RPC function
CREATE OR REPLACE FUNCTION public.convert_lead_to_partner(p_email TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_api_key TEXT;
    v_result JSONB;
    v_resend_key TEXT;
    v_request_id BIGINT;
    v_email_payload JSONB;
BEGIN
    -- 1. Locate user in auth.users by email
    SELECT id INTO v_user_id
    FROM auth.users
    WHERE email = p_email
    LIMIT 1;

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'User with email % not found', p_email;
    END IF;

    -- 2. Set is_partner = true in their profile
    UPDATE public.users
    SET is_partner = true
    WHERE id = v_user_id;

    IF NOT FOUND THEN
        INSERT INTO public.users (id, role, is_partner)
        VALUES (v_user_id, 'user', true);
    END IF;

    -- 3. Initialize a record in partner_credits with 10 complimentary credits
    INSERT INTO public.partner_credits (partner_id, credits_remaining)
    VALUES (v_user_id, 10)
    ON CONFLICT (partner_id) DO UPDATE
    SET credits_remaining = EXCLUDED.credits_remaining;

    -- 4. Generate their first production API key
    v_api_key := 'sk_prod_' || encode(gen_random_bytes(24), 'hex');

    INSERT INTO public.api_keys (user_id, service, api_key)
    VALUES (v_user_id, 'production', v_api_key)
    ON CONFLICT (user_id, service) DO UPDATE
    SET api_key = EXCLUDED.api_key;

    -- 5. Trigger an automated email via Resend
    -- We use pg_net if it exists, otherwise we'll try to execute it as an http post.
    -- To ensure it doesn't fail if pg_net is missing in standard setups, we can check.

    v_email_payload := jsonb_build_object(
        'from', 'AXiM Systems <noreply@axim.us.com>',
        'to', jsonb_build_array(p_email),
        'subject', 'Welcome to AXiM B2B Partner Program',
        'html', '<p>Congratulations! Your partner account has been activated with 10 complimentary credits.</p><p>Your production API key is: <strong>' || v_api_key || '</strong></p><p>Please keep this safe.</p>'
    );

    -- Try to send it via edge function or direct resend using net.http_post
    -- Assuming net.http_post is available (it is in Supabase standard setups)
    -- We can extract the RESEND_API_KEY from vault if available.
    BEGIN
        SELECT decrypted_secret INTO v_resend_key FROM vault.decrypted_secrets WHERE name = 'RESEND_API_KEY';
        IF v_resend_key IS NOT NULL THEN
            SELECT net.http_post(
                url:='https://api.resend.com/emails',
                headers:=jsonb_build_object(
                    'Content-Type', 'application/json',
                    'Authorization', 'Bearer ' || v_resend_key
                ),
                body:=v_email_payload
            ) INTO v_request_id;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        -- Fallback: Do not fail the transaction if pg_net or vault is not configured
        NULL;
    END;

    v_result := jsonb_build_object(
        'success', true,
        'user_id', v_user_id,
        'email', p_email,
        'message', 'User successfully converted to partner.'
    );

    RETURN v_result;
END;
$$;
