import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

serve(async (req) => {
    try {
        const payload = await req.json();

        // Extract the trace_id from the webhook payload
        // The payload might be directly the record (if custom pg_net) or Supabase standard webhook format
        const record = payload.record || payload;
        const traceId = record.trace_id;

        if (!traceId) {
            return new Response(JSON.stringify({ error: "Missing trace_id in payload" }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

        if (!supabaseUrl || !serviceRoleKey) {
            console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.");
            return new Response(JSON.stringify({ error: "Server configuration error" }), {
                status: 500,
                headers: { "Content-Type": "application/json" }
            });
        }

        const onyxPrompt = `A new document with Trace ID ${traceId} has been vaulted. Fetch it using your vault tool, read the contents, and verify there are no formatting errors, overlapping text, or missing signatures.`;

        // Internal fetch request to /api/onyx-bridge endpoint
        const response = await fetch(`${supabaseUrl}/functions/v1/onyx-bridge`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${serviceRoleKey}`
            },
            body: JSON.stringify({ prompt: onyxPrompt })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Failed to notify Onyx bridge:", errorText);
            return new Response(JSON.stringify({ error: "Failed to notify Onyx bridge" }), {
                status: 500,
                headers: { "Content-Type": "application/json" }
            });
        }

        return new Response(JSON.stringify({ message: "QA pipeline triggered successfully", trace_id: traceId }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        });

    } catch (error) {
        console.error("Error processing document-qa payload:", error);
        return new Response(JSON.stringify({ error: "Internal server error" }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
});
