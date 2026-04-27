import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.0.0";
import { corsHeaders, getCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") as string;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get(
  "SUPABASE_SERVICE_ROLE_KEY",
) as string;
const INTERNAL_SERVICE_KEY =
  (Deno.env.get("AXIM_INTERNAL_SERVICE_KEY") as string) ||
  "fallback_internal_key";
const ELLARS_MOBILE_NUMBER = Deno.env.get("ELLARS_MOBILE_NUMBER") as string || "+19039332672";

serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(origin) });
  }

  try {
    const body = await req.json();

    // Extract sender email, the subject, and the parsed text body from the payload (EmailIt payload)
    const sender = body.sender || body.from?.email || body.From; // Handle EmailIt format
    const messageText = body.text_body || body.text || body.Body; // Handle EmailIt format
    const subject = body.subject || body.Subject || "";
    const channel = body.channel || (body.From ? "sms" : "email");

    if (!sender || !messageText) {
      return new Response(
        JSON.stringify({ error: "Missing sender or message" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            ...getCorsHeaders(origin),
          },
        },
      );
    }

    // Authorized Sender Filter
    const isAuthorized =
      sender === "james.ellars@axim.us.com" ||
      (ELLARS_MOBILE_NUMBER && sender === ELLARS_MOBILE_NUMBER);

    if (!isAuthorized) {
      return new Response(JSON.stringify({ error: "Unauthorized sender" }), {
        status: 403,
        headers: {
          "Content-Type": "application/json",
          ...getCorsHeaders(origin),
        },
      });
    }

    // Forward to onyx-bridge
    const onyxBridgeUrl = `${SUPABASE_URL}/functions/v1/onyx-bridge`;

    const bridgeResponse = await fetch(onyxBridgeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        command: "admin_inbound_message",
        event_type: "admin_inbound_message",
        context: {
          source_channel: channel,
          message_text: messageText,
          sender: sender,
          subject: subject,
        },
      }),
    });

    if (!bridgeResponse.ok) {
      const errorText = await bridgeResponse.text();
      throw new Error(`Failed to forward to Onyx Bridge: ${errorText}`);
    }

    const bridgeData = await bridgeResponse.json();

    return new Response(
      JSON.stringify({
        status: "success",
        forwarded: true,
        onyx_response: bridgeData,
      }),
      {
        status: 200,
        headers: {
          ...getCorsHeaders(origin),
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error: any) {
    console.error("Communication Gateway Error:", error);
    return new Response(
      JSON.stringify({
        error: "Internal Server Error",
        message: error.message,
      }),
      {
        status: 500,
        headers: {
          ...getCorsHeaders(origin),
          "Content-Type": "application/json",
        },
      },
    );
  }
});
