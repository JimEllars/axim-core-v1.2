import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders as CORS_HEADERS,
  getCorsHeaders,
} from "../_shared/cors.ts";
import { notifyOnyx } from "../_shared/telemetry.ts";
import * as jose from "https://deno.land/x/jose@v4.14.4/index.ts";
import { generatePdf } from "../_shared/pdf-generators/index.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") as string;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get(
  "SUPABASE_SERVICE_ROLE_KEY",
) as string;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Helper to convert Uint8Array to base64
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: getCorsHeaders(req.headers.get("origin")),
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new Error("Missing or invalid Authorization header");
    }

    const token = authHeader.split(" ")[1];

    // We allow either the Service Role Key (for internal jobs) or a valid JWT
    let isInternalService = false;
    let payload: any = {};

    if (token === SUPABASE_SERVICE_ROLE_KEY) {
      isInternalService = true;
    } else {
      const jwtSecret = Deno.env.get("MICRO_APP_JWT_SECRET");

      if (!jwtSecret) {
        throw new Error(
          "Server configuration error: MICRO_APP_JWT_SECRET not set",
        );
      }

      const secret = new TextEncoder().encode(jwtSecret);

      try {
        const { payload: jwtPayload } = await jose.jwtVerify(token, secret);
        payload = jwtPayload;
      } catch (err) {
        throw new Error("Unauthorized");
      }
    }

    // 2. Parse body fields
    // Using Supabase client JS which sends `{ to, subject, body, userId }` or internal requests `{ email, ... }`
    const reqBody = await req.json();

    const toEmail = reqBody.email || reqBody.to || reqBody.recipient;
    const formData = reqBody.formData || {};
    // Extract appSource from payload productId or body app_source
    const appSource =
      payload.productId || reqBody.app_source || "AXiM Secure Document";
    const emailSubject =
      reqBody.subject || `Your AXiM Secure Document: ${appSource}`;
    // Support body.body or body.text
    const emailText =
      reqBody.body ||
      reqBody.text ||
      "<p>Thank you for your purchase. Your document is securely attached.</p>";
    const existingArtifactUrl = reqBody.artifactUrl;

    if (!toEmail) {
      throw new Error("Missing required field: email or to.");
    }

    console.log(
      `[Email Service] Sending email to ${toEmail} for app: ${appSource}`,
    );

    let attachments = [];

    // 3. Generate PDF if we are from a micro app or if formData exists without artifact URL
    if (
      reqBody.app_source &&
      !existingArtifactUrl &&
      Object.keys(formData).length > 0
    ) {
      const pdfBytes = await generatePdf(appSource, formData);
      const pdfBase64 = uint8ArrayToBase64(pdfBytes);
      attachments.push({
        filename: "AXiM_Document.pdf",
        content: pdfBase64,
      });
    }

    // 4. Send Email via EmailIt
    // Fetch EmailIt credentials from ecosystem_connections
    const { data: connection, error: connectionError } = await supabaseAdmin
      .from("ecosystem_connections")
      .select("webhook_url, api_key, status")
      .eq("service_name", "emailit")
      .single();

    if (connectionError || !connection) {
      throw new Error("EmailIt integration not found");
    }

    if (connection.status !== "active") {
      throw new Error("EmailIt integration is currently disabled");
    }

    const emailItApiKey = connection.api_key;
    const emailItUrl = connection.webhook_url;

    if (!emailItApiKey) {
      throw new Error(
        "Server configuration error: EmailIt API Key not set in vault",
      );
    }

    const emailItPayload: any = {
      from: "missioncontrol@AXiM.us.com", // Strictly map sender address
      to: [toEmail],
      subject: emailSubject,
      html_body: emailText,
      // Fallback text body if needed by API
      text_body:
        typeof emailText === "string"
          ? emailText.replace(/<[^>]*>?/gm, "")
          : "Please view this email in an HTML-compatible client.",
    };

    if (attachments.length > 0) {
      emailItPayload.attachments = attachments;
    }

    const resendResponse = await fetch(emailItUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${emailItApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(emailItPayload),
    });

    if (!resendResponse.ok) {
      const errorText = await resendResponse.text();
      // Log HIGH severity event to telemetry_logs
      await supabaseAdmin.from("telemetry_logs").insert({
        event: "integration_failure",
        app_type: "send-email",
        status_code: resendResponse.status,
        timestamp: new Date().toISOString(),
        details: {
          target_service: "emailit",
          error: errorText,
        },
      });
      // return 502 Bad Gateway to the caller
      return new Response(
        JSON.stringify({ error: `EmailIt API Error: ${errorText}` }),
        {
          status: 502,
          headers: {
            ...getCorsHeaders(req.headers.get("origin")),
            "Content-Type": "application/json",
          },
        },
      );
    }

    const resendData = await resendResponse.json();

    return new Response(
      JSON.stringify({
        success: true,
        message: `Email successfully sent to ${toEmail}`,
        id: resendData.id,
      }),
      {
        headers: {
          ...getCorsHeaders(req.headers.get("origin")),
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error: any) {
    console.error("[Email Service] Error:", error);
    const status =
      error.message.includes("Unauthorized") ||
      error.message.includes("Invalid or expired token") ||
      error.message.includes("Missing or invalid Authorization header")
        ? 401
        : 500;

    if (status === 500) {
      await notifyOnyx("/send-email", 500, { error: error.message });
    }
    return new Response(JSON.stringify({ error: error.message }), {
      status,
      headers: {
        ...getCorsHeaders(req.headers.get("origin")),
        "Content-Type": "application/json",
      },
    });
  }
});
