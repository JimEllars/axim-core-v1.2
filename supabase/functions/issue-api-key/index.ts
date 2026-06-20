import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.0.0';
import { corsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL') as string;
        const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') as string;
        const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
            global: { headers: { Authorization: authHeader } }
        });

        const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
        if (userError || !user) {
            return new Response(JSON.stringify({ error: 'Unauthorized user' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        // Generate key
        const rawKey = crypto.randomUUID().replace(/-/g, '');
        const fullKey = `axim_pk_${rawKey}`;
        const last4 = fullKey.slice(-4);

        // Hash the key for storage
        const encoder = new TextEncoder();
        const data = encoder.encode(fullKey);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        const supabaseAdmin = createClient(
            supabaseUrl,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string
        );

        const { data: insertedKey, error: insertError } = await supabaseAdmin
            .from('api_keys')
            .insert({
                user_id: user.id,
                service: `micro-app-access-${Date.now()}`,
                api_key: hashHex,
                display_key: `****************${last4}`
            })
            .select()
            .single();

        if (insertError) throw insertError;

        // Log audit
        await supabaseAdmin.from('hitl_audit_logs').insert({
            admin_id: user.id,
            action: 'approve',
            status: 'Approved',
            tool_called: 'issue-api-key',
            action_required: `Issued new API key ending in ${last4}`
        });

        return new Response(JSON.stringify({
            message: 'Key generated successfully',
            key: fullKey, // Only revealed once
            id: insertedKey.id,
            created_at: insertedKey.created_at,
            display_key: `****************${last4}`
        }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error: any) {
        console.error("Issue API Key Error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
