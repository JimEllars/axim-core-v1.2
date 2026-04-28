import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.0.0';
import { getCorsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: getCorsHeaders(req.headers.get('origin')) });
    }

    try {
        const authHeader = req.headers.get('Authorization');
        const isServiceRole = authHeader === `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`;

        let user = null;
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            isServiceRole ? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '' : Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: authHeader! } } }
        );

        if (!isServiceRole) {
            const { data: authData, error: userError } = await supabaseClient.auth.getUser();
            user = authData.user;

            if (userError || !user) {
                return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                    status: 401,
                    headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' },
                });
            }
        }

        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') as string,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string
        );

        const { log_id, status, action_payload } = await req.json();

        if (!log_id || !status) {
            return new Response(JSON.stringify({ error: 'Missing required parameters.' }), {
                status: 400,
                headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' }
            });
        }

        // 1. Call the database RPC to update status
        const { data, error } = await supabaseAdmin.rpc('resolve_hitl_action', {
            p_log_id: log_id,
            p_status: status,
            p_action_payload: action_payload
        });

        if (error) {
            throw error;
        }

        // 2. Perform follow-up edge function calls based on the action
        if (status === 'Approved' && data && data.action === 'publish_article') {
            try {
                const wpPayload = action_payload || {}; // We passed this from ApprovalQueue
                await supabaseAdmin.functions.invoke('wordpress-publisher', {
                    body: wpPayload
                });
                console.log(`Successfully dispatched wordpress-publisher for log ${log_id}`);
            } catch (wpError) {
                console.error(`Failed to dispatch wordpress-publisher for log ${log_id}`, wpError);
            }
        }

        return new Response(JSON.stringify({ success: true, ...data }), {
            headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' },
        });

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' },
        });
    }
});
