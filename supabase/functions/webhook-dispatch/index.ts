import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { corsHeaders } from "../_shared/cors.ts";
import { notifyOnyx } from '../_shared/telemetry.ts';

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function generateHmacSignature(payload: string, secretKey: string) {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secretKey);
    const cryptoKey = await crypto.subtle.importKey(
        "raw",
        keyData,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );
    const signature = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(payload));
    const hashArray = Array.from(new Uint8Array(signature));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}

serve(async (req) => {
    const origin = req.headers.get('origin');


    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const payload = await req.json();
        const { documentId, partnerId, metadata, fileUrl, event_type, payload: eventPayload } = payload;

        // Handle PR Merge Webhook Event
        if (event_type === 'lab.pr.merge') {
            const startTime = Date.now();
            const labEndpoint = Deno.env.get('LAB_WEBHOOK_URL') || 'https://api.github.com/repos/axim-systems/core/dispatches';
            const labSecret = Deno.env.get('LAB_WEBHOOK_SECRET') || 'lab_secret';

            const prMergePayload = JSON.stringify({
                event_type: 'pr_merge_request',
                client_payload: eventPayload
            });

            try {
                const signature = await generateHmacSignature(prMergePayload, labSecret);
                const response = await fetch(labEndpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-AXiM-Signature': signature,
                        'Authorization': `Bearer ${Deno.env.get('GITHUB_PAT') || 'mock_pat'}`
                    },
                    body: prMergePayload
                });

                const latency = Date.now() - startTime;
                const status_code = response.status;
                const responseText = await response.text();

                // Log to api_usage_logs
                await supabase.from('api_usage_logs').insert({
                    endpoint: '/webhook-dispatch/lab.pr.merge',
                    status_code,
                    execution_time_ms: latency,
                    payload: {
                        eventPayload,
                        response: responseText
                    }
                });

                return new Response(JSON.stringify({ success: response.ok, status: status_code }), {
                    status: 200,
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });

            } catch (err: any) {
                const latency = Date.now() - startTime;
                await supabase.from('api_usage_logs').insert({
                    endpoint: '/webhook-dispatch/lab.pr.merge',
                    status_code: 500,
                    execution_time_ms: latency,
                    payload: { error: err.message }
                });
                return new Response(JSON.stringify({ error: err.message }), {
                    status: 500,
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            }
        }

        const correlationId = req.headers.get('x-axim-correlation-id') || crypto.randomUUID();

        if (!partnerId) {
            return new Response(JSON.stringify({ error: "Missing partnerId" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // Validate via token if needed or rely on partnerId internal trust
        const authHeader = req.headers.get('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
             return new Response(JSON.stringify({ error: "Unauthorized" }), {
                 status: 401,
                 headers: { ...corsHeaders, "Content-Type": "application/json" },
             });
        }

        // Use service role key to query webhooks
        const { data: webhooks, error: webhookError } = await supabase
            .from("partner_webhooks")
            .select("endpoint_url, secret_key, sync_type")
            .eq("partner_id", partnerId)
            .eq("is_active", true);

        if (webhookError) {
            console.error(`[CID: ${correlationId}] Error fetching webhooks:`, webhookError);
            return new Response(JSON.stringify({ error: "Failed to fetch webhooks" }), {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        if (!webhooks || webhooks.length === 0) {
            return new Response(JSON.stringify({ message: "No active webhooks for partner" }), {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        const webhookPayload = JSON.stringify({
            event: "document.generated",
            data: {
                documentId,
                metadata,
                fileUrl
            },
            timestamp: new Date().toISOString(),
            correlationId
        });

        const dispatchResults = await Promise.all(webhooks.map(async (webhook) => {
            try {
                if (webhook.sync_type === 'blob' && fileUrl) {
                    // Enterprise Data Sovereignty: stream blob directly to partner S3/Blob endpoint
                    const fileResponse = await fetch(fileUrl);
                    if (!fileResponse.ok) {
                        throw new Error("Failed to fetch file for blob sync");
                    }

                    const response = await fetch(webhook.endpoint_url, {
                        method: "PUT",
                        headers: {
                            "Content-Type": fileResponse.headers.get("content-type") || "application/octet-stream",
                            "x-axim-correlation-id": correlationId
                        },
                        body: fileResponse.body
                    });

                    const success = response.ok;

                    if (!success) {
                       await notifyOnyx('/webhook-dispatch', 500, {
                          error: `Blob dispatch failed for ${webhook.endpoint_url}: ${response.status}`,
                          correlationId
                       });
                    } else {
                       await notifyOnyx('/webhook-dispatch', 200, {
                          message: `Blob dispatch successful for ${webhook.endpoint_url}`,
                          correlationId
                       });
                    }

                    return {
                        endpoint: webhook.endpoint_url,
                        status: response.status,
                        success,
                        type: 'blob'
                    };
                } else {
                    // Standard webhook payload
                    const signature = await generateHmacSignature(webhookPayload, webhook.secret_key);

                    const response = await fetch(webhook.endpoint_url, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "X-AXiM-Signature": signature,
                            "x-axim-correlation-id": correlationId
                        },
                        body: webhookPayload
                    });

                    const success = response.ok;

                    if (!success) {
                        await notifyOnyx('/webhook-dispatch', 500, {
                          error: `Webhook dispatch failed for ${webhook.endpoint_url}: ${response.status}`,
                          correlationId
                       });
                    } else {
                       await notifyOnyx('/webhook-dispatch', 200, {
                          message: `Webhook dispatch successful for ${webhook.endpoint_url}`,
                          correlationId
                       });
                    }

                    return {
                        endpoint: webhook.endpoint_url,
                        status: response.status,
                        success,
                        type: 'webhook'
                    };
                }
            } catch (err: any) {
                console.error(`[CID: ${correlationId}] Webhook dispatch error for ${webhook.endpoint_url}:`, err);
                await notifyOnyx('/webhook-dispatch', 500, {
                      error: `Webhook dispatch exception for ${webhook.endpoint_url}: ${err.message}`,
                      correlationId
                });
                return {
                    endpoint: webhook.endpoint_url,
                    error: err.message,
                    success: false
                };
            }
        }));

        return new Response(JSON.stringify({ results: dispatchResults }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

    } catch (error) {
        console.error("Webhook dispatch error:", error);
        await notifyOnyx('/webhook-dispatch', 500, { error: error.message });
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
