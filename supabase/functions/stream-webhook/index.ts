import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { corsHeaders } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const payload = await req.json();
        console.log("Received stream webhook:", payload);

        // Talk Studio / Cloudflare stream generic payload structure
        // Adjust these conditions based on the actual provider's webhook payload
        const isStarted = payload.status === 'live' || payload.event === 'stream.started' || payload.action === 'live';
        const isEnded = payload.status === 'offline' || payload.event === 'stream.ended' || payload.action === 'offline';

        if (isStarted) {
            // Update system_status to is_live = true
            await supabase
                .from('system_status')
                .update({ value: 'true'::jsonb, updated_at: new Date().toISOString() })
                .eq('key', 'is_live');

            // Emit event
            await supabase.from('events_ax2024').insert({
                type: 'LIVE_STREAM_STARTED',
                source: 'stream-webhook',
                data: payload
            });

            console.log("Processed stream started event.");
        } else if (isEnded) {
             // Update system_status to is_live = false
             await supabase
                .from('system_status')
                .update({ value: 'false'::jsonb, updated_at: new Date().toISOString() })
                .eq('key', 'is_live');

            // Emit event
             await supabase.from('events_ax2024').insert({
                type: 'LIVE_STREAM_ENDED',
                source: 'stream-webhook',
                data: payload
            });
            console.log("Processed stream ended event.");
        }

        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    } catch (error: any) {
        console.error("Webhook processing error:", error);
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
});
