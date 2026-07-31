import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.0.0";
import { notifyOnyx } from "../_shared/telemetry.ts";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") as string;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string;
const INTERNAL_SERVICE_KEY = (Deno.env.get("AXIM_INTERNAL_SERVICE_KEY") as string) || "fallback_internal_key";
const ELLARS_MOBILE_NUMBER = Deno.env.get("ELLARS_MOBILE_NUMBER") as string || "+19039332672";

serve(async (req) => {
  const startTime = Date.now();
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const edgeHeaders = {
        ...corsHeaders,
        "Content-Type": "application/json",
        "X-AXiM-RateLimit-Remaining": "999",
        "X-AXiM-Edge-Location": "global-edge"
    };
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = await req.json();

    // Extract sender email, the subject, and the parsed text body from the payload (EmailIt payload)
    const sender = body.sender || body.from?.email || body.From; // Handle EmailIt format
    const messageText = body.text_body || body.text || body.Body; // Handle EmailIt format
    const subject = body.subject || body.Subject || "";
    const channel = body.channel || (body.From ? "sms" : "email");

    if (!sender || !messageText) {
      const computeMs = Date.now() - startTime;
      await supabase.from("api_usage_logs").insert({
        endpoint: "/communication-gateway",
        status_code: 400,
        compute_ms: computeMs,
        app_id: "axim-comm-gateway",
        payload: { error: "Missing sender or message" }
      });

      return new Response(
        JSON.stringify({ error: "Missing sender or message" }),
        { status: 400, headers: edgeHeaders }
      );
    }

    // Authorized Sender Filter via DB
    const { data: allowedSender, error: dbError } = await supabase
      .from("communication_allowlist")
      .select("email_address")
      .eq("email_address", sender)
      .single();

    const isAuthorized = allowedSender != null || (ELLARS_MOBILE_NUMBER && sender === ELLARS_MOBILE_NUMBER);

    if (!isAuthorized) {
      const computeMs = Date.now() - startTime;

      // Log usage
      await supabase.from("api_usage_logs").insert({
        endpoint: "/communication-gateway",
        status_code: 403,
        compute_ms: computeMs,
        app_id: "axim-comm-gateway",
        payload: { error: "unauthorized_sender", sender: sender }
      });

      // Log warning event
      await supabase.from("telemetry_events").insert({
        component_id: "core_api",
        severity: "WARN",
        message: "unauthorized_sender",
        payload: { sender: sender }
      });

      return new Response(JSON.stringify({ error: "Unauthorized sender" }), {
        status: 403,
        headers: edgeHeaders,
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

    const computeMs = Date.now() - startTime;
    await supabase.from("api_usage_logs").insert({
      endpoint: "/communication-gateway",
      status_code: 200,
      compute_ms: computeMs,
      app_id: "axim-comm-gateway",
      payload: { sender: sender, subject: subject, channel: channel, forwarded: true }
    });

    return new Response(
      JSON.stringify({
        status: "success",
        forwarded: true,
        onyx_response: bridgeData,
      }),
      { status: 200, headers: edgeHeaders }
    );
  } catch (error: any) {
    console.error("Communication Gateway Error:", error);
    const computeMs = Date.now() - startTime;

    try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        await supabase.from("api_usage_logs").insert({
            endpoint: "/communication-gateway",
            status_code: 500,
            compute_ms: computeMs,
            app_id: "axim-comm-gateway",
            payload: { error: error.message }
        });
        await supabase.from("telemetry_events").insert({
            component_id: "core_api",
            severity: "ERROR",
            message: "communication_gateway_error",
            payload: { error: error.message }
        });
    } catch(e) {}

    return new Response(
      JSON.stringify({ error: "Internal Server Error", message: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json", "X-AXiM-RateLimit-Remaining": "999", "X-AXiM-Edge-Location": "global-edge" } }
    );
  }
});
