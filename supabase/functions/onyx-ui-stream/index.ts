import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.6";
import { corsHeaders } from "../_shared/cors.ts";

function sanitizePayload(payload: any): any {
    if (!payload) return payload;

    const maskedValue = '[REDACTED]';
    const sensitiveKeys = ['password', 'token', 'secret', 'api_key', 'email', 'phone', 'street_address'];

    if (typeof payload === 'object') {
        if (Array.isArray(payload)) {
            return payload.map(item => sanitizePayload(item));
        }

        const sanitized = { ...payload };
        for (const key in sanitized) {
            if (Object.prototype.hasOwnProperty.call(sanitized, key)) {
                if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
                    sanitized[key] = maskedValue;
                } else if (typeof sanitized[key] === 'object') {
                    sanitized[key] = sanitizePayload(sanitized[key]);
                }
            }
        }
        return sanitized;
    }

    return payload;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    let payload = await req.json();
    payload = sanitizePayload(payload);

    const { worker_id, message, role, timestamp } = payload;

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const channel = supabase.channel('onyx_ui_stream');

    await channel.send({
      type: 'broadcast',
      event: 'message',
      payload: { worker_id, message, role, timestamp },
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
