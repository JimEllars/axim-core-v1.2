import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.0.0';
import { hashApiKey, generateApiKey } from '../_shared/crypto.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
            throw new Error('Missing Authorization header');
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL') as string;
        const expectedKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

        const supabaseAdmin = createClient(supabaseUrl, expectedKey);

        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(authHeader.replace('Bearer ', ''));

        if (authError || !user) {
             throw new Error('Unauthorized');
        }

        const { key_id } = await req.json();

        if (!key_id) {
            throw new Error('key_id is required');
        }

        // Fetch the key to ensure it belongs to the user
        const { data: existingKey, error: fetchError } = await supabaseAdmin
            .from('api_keys')
            .select('*')
            .eq('id', key_id)
            .eq('user_id', user.id)
            .single();

        if (fetchError || !existingKey) {
            throw new Error('API Key not found or you do not have permission');
        }

        // Generate a new secure API key
        const newApiKey = generateApiKey();

        // Hash the key for storage
        const hashedKey = await hashApiKey(newApiKey);

        // Display key logic (e.g., first 8 chars + '...' + last 4 chars)
        const displayKey = newApiKey.substring(0, 8) + '...' + newApiKey.substring(newApiKey.length - 4);

        // Rotate the key (update existing)
        const { error: updateError } = await supabaseAdmin
            .from('api_keys')
            .update({
                api_key: hashedKey,
                display_key: displayKey,
                updated_at: new Date().toISOString()
            })
            .eq('id', key_id);

        if (updateError) {
            throw new Error(`Failed to update API key: ${updateError.message}`);
        }

        // Log the rotation in hitl_audit_logs
        await supabaseAdmin.from('hitl_audit_logs').insert({
            action_required: `Rotated API Key for service: ${existingKey.service}`,
            status: 'Approved',
            ticket_id: null // System action
        });

        // Return the plaintext key exactly once
        return new Response(JSON.stringify({
            message: 'API Key rotated successfully',
            api_key: newApiKey,
            display_key: displayKey
        }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error: any) {
        console.error("Rotate API Key Fatal Error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
