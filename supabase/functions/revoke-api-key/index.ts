import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.0.0';

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

        // Soft-revoke the key
        const { error: updateError } = await supabaseAdmin
            .from('api_keys')
            .update({
                status: 'revoked',
                revoked_at: new Date().toISOString()
            })
            .eq('id', key_id);

        if (updateError) {
            throw new Error(`Failed to revoke API key: ${updateError.message}`);
        }

        // Log the revocation in hitl_audit_logs
        await supabaseAdmin.from('hitl_audit_logs').insert({
            action_required: `Revoked API Key for service: ${existingKey.service}`,
            status: 'Approved',
            ticket_id: null // System action
        });

        return new Response(JSON.stringify({
            message: 'API Key revoked successfully'
        }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error: any) {
        console.error("Revoke API Key Fatal Error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
