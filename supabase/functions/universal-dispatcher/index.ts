import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") as string;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get(
  "SUPABASE_SERVICE_ROLE_KEY",
) as string;
const INTERNAL_SERVICE_KEY =
  (Deno.env.get("AXIM_INTERNAL_SERVICE_KEY") as string) ||
  "fallback_internal_key";
const ELLARS_MOBILE_NUMBER = Deno.env.get("ELLARS_MOBILE_NUMBER") as string || "+19039332672";

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const internalKeyHeader = req.headers.get("X-Axim-Internal-Service-Key");
    if (!internalKeyHeader || internalKeyHeader !== INTERNAL_SERVICE_KEY) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    let { target_service, action_type, payload } = body;

    if (!target_service || !action_type || !payload) {
      return new Response(
        JSON.stringify({
          error:
            "Missing required fields: target_service, action_type, or payload",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // --- Omnichannel Response Logic ---
    if (target_service.toLowerCase() === "email") {
      // Intercept logic for Mr. Ellars
      // if the payload indicates the target is Mr. Ellars or admin
      const isForEllars =
        payload.recipient === "admin" ||
        payload.recipient === "james.ellars@axim.us.com";
      if (isForEllars) {
        payload = {
          ...payload,
          to: "james.ellars@axim.us.com",
          cc: "jrellars@gmail.com",
        };
      }
    } else if (target_service.toLowerCase() === "sms") {
      const isForEllars =
        payload.recipient === "admin" ||
        payload.recipient === ELLARS_MOBILE_NUMBER;

      let text = payload.message || payload.text || payload.body || "";

      if (isForEllars && ELLARS_MOBILE_NUMBER) {
        if (text.length > 160) {
          text = text.substring(0, 150) + "... [Full report on Hub]";
        }
        payload = {
          To: ELLARS_MOBILE_NUMBER,
          From: payload.from || payload.From || "",
          Body: text,
        };
      } else {
        payload = {
          To: payload.to || payload.To || "",
          From: payload.from || payload.From || "",
          Body: text,
        };
      }
    }
    // ------------------------------------

    // 1. Query ecosystem_connections for the target_service
    const { data: connection, error: connectionError } = await supabaseAdmin
      .from("ecosystem_connections")
      .select("webhook_url, api_key, status")
      .eq("service_name", target_service.toLowerCase())
      .single();

    if (connectionError || !connection) {
      throw new Error(
        `Integration not found or inactive for service: ${target_service}`,
      );
    }

    if (connection.status !== "active") {
      throw new Error(
        `Integration is currently disabled for service: ${target_service}`,
      );
    }

    // 2. Prepare and send the payload securely
    const targetUrl = connection.webhook_url;
    let headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    let fetchBody: string | URLSearchParams = JSON.stringify({
      action_type,
      payload,
      timestamp: new Date().toISOString(),
    });

    if (target_service.toLowerCase() === "sms") {
      headers = {
        "Content-Type": "application/x-www-form-urlencoded",
      };

      // Basic Auth for Twilio using api_key (assuming format AccountSid:AuthToken or similar passed in api_key)
      if (connection.api_key) {
        headers["Authorization"] = `Basic ${btoa(connection.api_key)}`;
      }

      const formParams = new URLSearchParams();
      if (payload.To) formParams.append("To", payload.To);
      if (payload.From) formParams.append("From", payload.From);
      if (payload.Body) formParams.append("Body", payload.Body);

      fetchBody = formParams;
    } else {
      if (connection.api_key) {
        headers["Authorization"] = `Bearer ${connection.api_key}`;
      }
    }

    const response = await fetch(targetUrl, {
      method: "POST",
      headers,
      body: fetchBody,
    });

    // 3. Log to telemetry on 500 errors
    if (!response.ok) {
      const responseText = await response.text();
      const statusCode = response.status;

      if (statusCode >= 500) {
        await supabaseAdmin.from("telemetry_logs").insert({
          event: "integration_failure",
          app_type: "universal-dispatcher",
          status_code: statusCode,
          timestamp: new Date().toISOString(),
          details: {
            target_service,
            action_type,
            error: responseText,
          },
        });
      }

      return new Response(
        JSON.stringify({
          error: `Downstream service returned ${statusCode}`,
          details: responseText,
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Success response
    const downstreamResult = await response.text();

    // Update last_triggered time
    await supabaseAdmin
      .from("ecosystem_connections")
      .update({ last_triggered: new Date().toISOString() })
      .eq("service_name", target_service.toLowerCase());

    return new Response(
      JSON.stringify({
        success: true,
        target_service,
        action_type,
        downstreamResponse: downstreamResult,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error: any) {
    console.error("Universal Dispatcher Error:", error);

    // Log unexpected errors as integration_failures as well
    await supabaseAdmin.from("telemetry_logs").insert({
      event: "integration_failure",
      app_type: "universal-dispatcher",
      status_code: 500,
      timestamp: new Date().toISOString(),
      details: {
        error: error.message,
      },
    });

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
