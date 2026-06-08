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

        if (status === 'Approved' && data && data.action === 'omnichannel_broadcast') {
            try {
                const omnichannelPayload = action_payload || {};
                await supabaseAdmin.functions.invoke('omnichannel-publisher', {
                    body: omnichannelPayload,
                    headers: {
                        'X-Axim-Internal-Service-Key': Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
                    }
                });
                console.log(`Successfully dispatched omnichannel-publisher for log ${log_id}`);
            } catch (ocError) {
                console.error(`Failed to dispatch omnichannel-publisher for log ${log_id}`, ocError);
            }
        }

        // When an administrator confirms an action patch, compile the related support conversation log thread.
        if (status === 'Approved') {
            try {
                // Fetch the ticket_id from hitl_audit_logs
                const { data: logData, error: logError } = await supabaseAdmin
                    .from('hitl_audit_logs')
                    .select('ticket_id')
                    .eq('id', log_id)
                    .single();

                if (logData && logData.ticket_id) {
                    const ticketId = logData.ticket_id;

                    // Fetch the ticket and messages
                    const { data: ticketData } = await supabaseAdmin
                        .from('support_tickets')
                        .select('subject, description')
                        .eq('id', ticketId)
                        .single();

                    // Send to llm-proxy for closed-loop RAG memory enrichment
                    const threadLog = `Ticket Subject: ${ticketData?.subject}\nTicket Description: ${ticketData?.description}\nResolution Action Payload: ${JSON.stringify(action_payload)}`;

                    await supabaseAdmin.functions.invoke('llm-proxy', {
                        body: {
                            command: "Generate a markdown-formatted procedural text block detailing this issue and its resolution. Then generate a vector embedding to insert into ai_memory_banks.",
                            threadLog: threadLog,
                            ticketId: ticketId,
                            action: "rag_memory_enrichment"
                        },
                        headers: {
                            'X-Axim-Internal-Service-Key': Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
                        }
                    });
                    console.log(`Successfully dispatched llm-proxy for memory enrichment for ticket ${ticketId}`);
                }
            } catch (err) {
                console.error(`Failed to process closed-loop memory enrichment for log ${log_id}`, err);
            }
        }

        // Alert operator about resolution
        const emailPayload = {
            to_email: "jrellars@gmail.com",
            subject: `[INFO] HITL Action Resolved: ${log_id}`,
            html_content: `<p>A HITL action has been marked as <strong>${status}</strong>.</p><p>Ticket ID: ${log_id}</p>`
        };
        fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
            },
            body: JSON.stringify(emailPayload)
        }).catch(e => console.error("Failed to dispatch alert email:", e));

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
