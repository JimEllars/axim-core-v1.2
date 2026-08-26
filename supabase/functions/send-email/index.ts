import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders as CORS_HEADERS,

} from "../_shared/cors.ts";
import { notifyOnyx } from "../_shared/telemetry.ts";
import { validateMicroAppSession } from "../_shared/auth.ts";
import { generatePdf } from "../_shared/pdf-generators/index.ts";
import { EmailDispatchManager } from "../_shared/EmailDispatchManager.ts";


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
  const startTime = Date.now();
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  const edgeHeaders = {
        ...corsHeaders,
        "Content-Type": "application/json",
        "X-AXiM-RateLimit-Remaining": "999",
        "X-AXiM-Edge-Location": "global-edge"
    };
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
                headers: edgeHeaders,
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

    // 4. Send Email via Dual-Provider Dispatch Manager
    // Pull required API keys and domain configuration
    const emailItApiKey = Deno.env.get("EMAILIT_API_KEY");
    const emailItSenderDomain = Deno.env.get("EMAILIT_SENDER_DOMAIN");
    const resendApiKey = Deno.env.get("RESEND_API_KEY") || "dummy_fallback"; // Ensure a fallback exists for testing if not set

    if (!emailItApiKey || !emailItSenderDomain) {
      throw new Error(
        "Server configuration error: EMAILIT_API_KEY or EMAILIT_SENDER_DOMAIN not set in vault",
      );
    }

    const senderEmail = `missioncontrol@${emailItSenderDomain}`;

    const dispatchManager = new EmailDispatchManager(emailItApiKey, resendApiKey);

    let dispatchResult;
    try {
      dispatchResult = await dispatchManager.send({
        from: senderEmail,
        to: [toEmail],
        subject: emailSubject,
        html: sanitizedHtmlContent,
        text: emailTextContent,
        attachments: attachments.length > 0 ? attachments : undefined
      });
    } catch (networkError: any) {
      // Wrap the operational email execution inside a robust try/catch diagnostic block.
      // Simulate logging to public.api_usage_logs containing the response code.
      const computeMs = Date.now() - startTime;
      await supabaseAdmin.from("api_usage_logs").insert({
        endpoint: "/send-email",
        app_id: appSource,
        compute_ms: computeMs,
        status_code: 502,
        payload: { error: networkError.message }
      });
      await supabaseAdmin.from("telemetry_events").insert({
        component_id: "core_api",
        severity: "WARN",
        message: "email_dispatch_fault",
        payload: { error: networkError.message, to: toEmail }
      });

      // Task 3: Transactional Mail Dead-Letter Queue (DLQ)
      await supabaseAdmin.from("email_dead_letter_queue").insert({
          to_email: toEmail,
          subject: emailSubject,
          html_content: sanitizedHtmlContent,
          error_diagnostic: networkError.message
      });

      return new Response(
        JSON.stringify({ error: `Email Dispatch Error: ${networkError.message}` }),
        {
          status: 502,
          headers: edgeHeaders,
        },
      );
    }

    if (!dispatchResult.success) {
      const errorText = dispatchResult.rawResponse ? JSON.stringify(dispatchResult.rawResponse) : 'Unknown error';
      // If dispatch responds with an edge error or timeout flag, write a failure trace row directly into public.api_usage_logs containing the response code.
      const computeMs = Date.now() - startTime;
      await supabaseAdmin.from("api_usage_logs").insert({
        endpoint: "/send-email",
        app_id: appSource,
        compute_ms: computeMs,
        status_code: 502,
        payload: { error: errorText }
      });
      await supabaseAdmin.from("telemetry_events").insert({
        component_id: "core_api",
        severity: "WARN",
        message: "email_dispatch_fault",
        payload: { error: errorText, to: toEmail }
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
        JSON.stringify({ error: `Email Dispatch Error: ${errorText}` }),
        {
          status: 502,
          headers: edgeHeaders,
        },
      );
    }

    const computeMs = Date.now() - startTime;
    await supabaseAdmin.from("api_usage_logs").insert({
      endpoint: "/send-email",
      status_code: 200,
      compute_ms: computeMs,
      app_id: appSource,
      payload: { success: true, to: toEmail, subject: emailSubject, id: dispatchResult.messageId, provider: dispatchResult.provider }
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: `Email successfully sent to ${toEmail} via ${dispatchResult.provider}`,
        id: dispatchResult.messageId,
        provider: dispatchResult.provider
      }),
      {
        headers: edgeHeaders,
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

    const computeMs = Date.now() - startTime;
    try {
        await supabaseAdmin.from("api_usage_logs").insert({
            endpoint: "/send-email",
            app_id: "axim-email-service",
            compute_ms: computeMs,
            status_code: status,
            payload: { error: error.message }
        });
    } catch(e) {}

    if (status === 500) {
      await notifyOnyx("/send-email", 500, { error: error.message });
    }
    return new Response(JSON.stringify({ error: error.message }), {
      status,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/json",
        "X-AXiM-RateLimit-Remaining": "999",
        "X-AXiM-Edge-Location": "global-edge"
      },
    });
  }
});
