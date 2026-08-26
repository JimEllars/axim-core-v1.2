import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { verifyEmailItSignature } from "../_shared/crypto.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") as string;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get(
  "SUPABASE_SERVICE_ROLE_KEY",
) as string;

const EMAILIT_SECRET_KEY = Deno.env.get("EMAILIT_WEBHOOK_SECRET") || Deno.env.get("EMAILIT_SECRET_KEY") || "";

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const rawBody = await req.text();
    let body;
    try {
      body = JSON.parse(rawBody);
    } catch (e) {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    let provider = "unknown";
    let event_type = "";
    let recipient = "";
    let timestamp = new Date().toISOString();

    const emailitSignature = req.headers.get("X-Emailit-Signature");

    if (emailitSignature) {
        provider = "emailit";
        // Verify signature
        if (EMAILIT_SECRET_KEY) {
            const isValid = await verifyEmailItSignature(emailitSignature, rawBody, EMAILIT_SECRET_KEY);
            if (!isValid) {
                 return new Response(JSON.stringify({ error: "Invalid Signature" }), {
                    status: 401,
                    headers: { "Content-Type": "application/json", ...corsHeaders },
                  });
            }
        }

        event_type = body.type || body.event_type;
        recipient = body.data?.to || body.recipient;
        if(body.created_at) timestamp = new Date(body.created_at).toISOString();
        else if (body.timestamp) timestamp = body.timestamp;
    } else {
         provider = "resend";
         event_type = body.type || body.event_type;
         if (body.data?.to) {
             recipient = Array.isArray(body.data.to) ? body.data.to[0] : body.data.to;
         } else {
             recipient = body.recipient;
         }
         if (body.created_at) timestamp = body.created_at;
         else if (body.timestamp) timestamp = body.timestamp;
    }

    if (!event_type || !recipient) {
      return new Response(JSON.stringify({ error: "Missing fields" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Normalize event statuses (Delivered, Bounced, Queued, Opened, Clicked)
    let normalizedEvent = event_type;
    const eventLower = event_type.toLowerCase();

    if (eventLower.includes("delivered")) normalizedEvent = "Delivered";
    else if (eventLower.includes("sent") || eventLower.includes("accepted")) normalizedEvent = "Queued";
    else if (eventLower.includes("bounced") || eventLower.includes("failed")) normalizedEvent = "Bounced";
    else if (eventLower.includes("open")) normalizedEvent = "Opened";
    else if (eventLower.includes("click")) normalizedEvent = "Clicked";
    else normalizedEvent = event_type;

    const logTask = async () => {
        try {
            const { error } = await supabaseAdmin.from("telemetry_logs").insert({
              event: "email_engagement",
              app_type: provider,
              timestamp: timestamp,
              details: {
                  recipient,
                  event_type: normalizedEvent,
                  raw_event: event_type,
              },
            });
            if (error) console.error("Error inserting telemetry log:", error);
        } catch(e) {
            console.error("Failed async logging:", e);
        }
    };

    // Asynchronously log using EdgeRuntime.waitUntil if available
    if (typeof (globalThis as any).EdgeRuntime !== 'undefined' && (globalThis as any).EdgeRuntime.waitUntil) {
        (globalThis as any).EdgeRuntime.waitUntil(logTask());
    } else {
        logTask();
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Email Tracking Webhook Error:", error);
    return new Response(
      JSON.stringify({
        error: "Internal Server Error",
        message: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
