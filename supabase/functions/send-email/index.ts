import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders as CORS_HEADERS,
  getCorsHeaders,
} from "../_shared/cors.ts";
import { notifyOnyx } from "../_shared/telemetry.ts";
import { validateMicroAppSession } from "../_shared/auth.ts";
import { generatePdf } from "../_shared/pdf-generators/index.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") as string;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get(
  "SUPABASE_SERVICE_ROLE_KEY",
) as string;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Helper to convert Uint8Array to base64
function sanitizeHtmlContent(html: string): string {
  if (!html) return "";
  let sanitized = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
  sanitized = sanitized.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "");
  sanitized = sanitized.replace(/ on\w+="[^"]*"/g, "").replace(/ on\w+=\x27[^']*\x27/g, "").replace(/ on\w+=\w+/g, "");
  return sanitized;
}

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
    let payload;
    try {
      payload = await validateMicroAppSession(req);
    } catch (err: any) {
      throw new Error("Unauthorized");
    }

    if (!payload || !payload.user) {
      throw new Error("Unauthorized");
    }

    // 2. Parse body fields
    // Accept incoming parameters matching a standard schema: to_email, subject, html_content, and text_content.
    const reqBody = await req.json();

    const toEmail =
      reqBody.to_email || reqBody.email || reqBody.to || reqBody.recipient;
    const formData = reqBody.formData || {};
    // Extract appSource from payload productId or body app_source
    const appSource =
      payload.productId || reqBody.app_source || "AXiM Secure Document";
    const emailSubject =
      reqBody.subject || `Your AXiM Secure Document: ${appSource}`;
    // Support body.body or body.text
    const emailHtmlContent =
      reqBody.html_content ||
      reqBody.body ||
      "<p>Thank you for your purchase. Your document is securely attached.</p>";

    const sanitizedHtmlContent = sanitizeHtmlContent(emailHtmlContent);
    const emailTextContent =
      reqBody.text_content ||
      reqBody.text ||
      (typeof sanitizedHtmlContent === "string"
        ? sanitizedHtmlContent.replace(/<[^>]*>?/gm, "")
        : "Please view this email in an HTML-compatible client.");
    const existingArtifactUrl = reqBody.artifactUrl;

    if (!toEmail) {
      throw new Error("Missing required field: to_email.");
    }

    console.log(
      `[Email Service] Sending email to ${toEmail} for app: ${appSource}`,
    );

    // Isolation Flag logic
    const isProductionStaging = Deno.env.get("VITE_PRODUCTION_STAGING") === "true";
    if (isProductionStaging && toEmail !== "jrellars@gmail.com") {
        console.log(`[Email Service] VITE_PRODUCTION_STAGING is true. Intercepting email intended for ${toEmail}`);

        await supabaseAdmin.from("api_usage_logs").insert({
            endpoint: "/send-email",
            app_id: appSource,
            execution_time_ms: 0,
            status_code: 200,
            request_payload: {
                action: "intercepted_by_staging_flag",
                intended_recipient: toEmail,
                subject: emailSubject
            },
        });

        return new Response(
            JSON.stringify({
                success: true,
                message: `Email sending intercepted by staging configuration for ${toEmail}`,
                intercepted: true
            }),
            {
                headers: {
                ...getCorsHeaders(req.headers.get("origin")),
                "Content-Type": "application/json",
                },
            },
        );
    }

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
    // Pull EMAILIT_API_KEY and EMAILIT_SENDER_DOMAIN from the secure vault configuration
    const emailItApiKey = Deno.env.get("EMAILIT_API_KEY");
    const emailItSenderDomain = Deno.env.get("EMAILIT_SENDER_DOMAIN");

    if (!emailItApiKey || !emailItSenderDomain) {
      throw new Error(
        "Server configuration error: EMAILIT_API_KEY or EMAILIT_SENDER_DOMAIN not set in vault",
      );
    }

    // Dispatch structured JSON message payloads mapped to the official EmailIt endpoint
    const emailItUrl = "https://api.emailit.com/v1/emails";
    const senderEmail = `missioncontrol@${emailItSenderDomain}`;

    const emailItPayload: any = {
      from: senderEmail,
      to: [toEmail],
      subject: emailSubject,
      html: sanitizedHtmlContent,
      text: emailTextContent,
    };

    if (attachments.length > 0) {
      emailItPayload.attachments = attachments;
    }

    let emailItResponse;
    try {
      emailItResponse = await fetch(emailItUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${emailItApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(emailItPayload),
      });
    } catch (networkError: any) {
      // Wrap the operational email execution inside a robust try/catch diagnostic block.
      // Simulate logging to public.api_usage_logs containing the response code.
      await supabaseAdmin.from("api_usage_logs").insert({
        endpoint: "/send-email",
        app_id: appSource,
        execution_time_ms: -1,
        status_code: 502,
        request_payload: { error: networkError.message },
      });

      // Task 3: Transactional Mail Dead-Letter Queue (DLQ)
      await supabaseAdmin.from("email_dead_letter_queue").insert({
          to_email: toEmail,
          subject: emailSubject,
          html_content: sanitizedHtmlContent,
          error_diagnostic: networkError.message
      });

      return new Response(
        JSON.stringify({ error: `EmailIt API Error: Network drop or timeout` }),
        {
          status: 502,
          headers: {
            ...getCorsHeaders(req.headers.get("origin")),
            "Content-Type": "application/json",
          },
        },
      );
    }

    if (!emailItResponse.ok) {
      const errorText = await emailItResponse.text();
      // If EmailIt responds with an edge error or timeout flag, write a failure trace row directly into public.api_usage_logs containing the response code.
      await supabaseAdmin.from("api_usage_logs").insert({
        endpoint: "/send-email",
        app_id: appSource,
        execution_time_ms: -1,
        status_code: emailItResponse.status,
        request_payload: { error: errorText },
      });

      // Task 3: Transactional Mail Dead-Letter Queue (DLQ)
      await supabaseAdmin.from("email_dead_letter_queue").insert({
          to_email: toEmail,
          subject: emailSubject,
          html_content: sanitizedHtmlContent,
          error_diagnostic: errorText
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

    const emailItData = await emailItResponse.json();

    return new Response(
      JSON.stringify({
        success: true,
        message: `Email successfully sent to ${toEmail}`,
        id: emailItData.id,
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
