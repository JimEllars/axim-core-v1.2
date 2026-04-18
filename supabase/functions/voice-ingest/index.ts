import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { corsHeaders } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const onyxBridgeUrl = Deno.env.get("ONYX_BRIDGE_URL") || `${supabaseUrl}/functions/v1/onyx-bridge`;

const supabase = createClient(supabaseUrl, supabaseKey);

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
            return new Response(JSON.stringify({ error: 'Missing Authorization header' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
        if (authError || !user) {
             // Check if it's the service role key for internal/admin bypass
             if (authHeader.replace('Bearer ', '') !== supabaseKey) {
                 return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
             }
        }

        const payload = await req.json();
        const { text, device_id } = payload;

        if (!text) {
            return new Response(JSON.stringify({ error: "Missing text payload" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // Forward to onyx-bridge
        const onyxResponse = await fetch(onyxBridgeUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${supabaseKey}` // Authenticate internal call
            },
            body: JSON.stringify({
                command: text,
                context: {
                    source: "voice",
                    deviceId: device_id,
                    userId: user?.id || 'admin'
                }
            })
        });

        if (!onyxResponse.ok) {
            const errorText = await onyxResponse.text();
            throw new Error(`Onyx bridge error: ${onyxResponse.status} ${errorText}`);
        }

        const onyxData = await onyxResponse.json();

        return new Response(JSON.stringify({ success: true, result: onyxData }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

    } catch (error) {
        console.error("Voice ingest error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
