import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { corsHeaders } from "../_shared/cors.ts";

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
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const payload = await req.json();
        const { documentId, partnerId, metadata, fileUrl } = payload;

        if (!partnerId) {
            return new Response(JSON.stringify({ error: "Missing partnerId" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        const { data: webhooks, error: webhookError } = await supabase
            .from("partner_webhooks")
            .select("endpoint_url, secret_key, sync_type")
            .eq("partner_id", partnerId)
            .eq("is_active", true);

        if (webhookError) {
            console.error("Error fetching webhooks:", webhookError);
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
            timestamp: new Date().toISOString()
        });

        const dispatchResults = [];

        for (const webhook of webhooks) {
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
                            "Content-Type": fileResponse.headers.get("content-type") || "application/octet-stream"
                        },
                        body: fileResponse.body
                    });

                    dispatchResults.push({
                        endpoint: webhook.endpoint_url,
                        status: response.status,
                        success: response.ok,
                        type: 'blob'
                    });
                } else {
                    // Standard webhook payload
                    const signature = await generateHmacSignature(webhookPayload, webhook.secret_key);

                    const response = await fetch(webhook.endpoint_url, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "X-AXiM-Signature": signature
                        },
                        body: webhookPayload
                    });

                    dispatchResults.push({
                        endpoint: webhook.endpoint_url,
                        status: response.status,
                        success: response.ok,
                        type: 'webhook'
                    });
                }
            } catch (err) {
                dispatchResults.push({
                    endpoint: webhook.endpoint_url,
                    error: err.message,
                    success: false
                });
            }
        }

        return new Response(JSON.stringify({ results: dispatchResults }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

    } catch (error) {
        console.error("Webhook dispatch error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
