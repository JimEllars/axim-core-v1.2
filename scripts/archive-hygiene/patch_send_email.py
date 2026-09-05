import re

with open('supabase/functions/send-email/index.ts', 'r') as f:
    content = f.read()

# Add import for EmailDispatchManager
import_statement = 'import { EmailDispatchManager } from "../_shared/EmailDispatchManager.ts";\n'
if import_statement not in content:
    content = content.replace(
        'import { generatePdf } from "../_shared/pdf-generators/index.ts";',
        'import { generatePdf } from "../_shared/pdf-generators/index.ts";\n' + import_statement
    )

# Replace the email fetching logic with EmailDispatchManager
# Look for the section after PDF generation where EmailIt logic starts

emailit_block_start = """    // 4. Send Email via EmailIt
    // Pull EMAILIT_API_KEY and EMAILIT_SENDER_DOMAIN from the secure vault configuration
    const emailItApiKey = Deno.env.get("EMAILIT_API_KEY");
    const emailItSenderDomain = Deno.env.get("EMAILIT_SENDER_DOMAIN");"""

emailit_block_end = """    const computeMs = Date.now() - startTime;
    await supabaseAdmin.from("api_usage_logs").insert({
      endpoint: "/send-email",
      status_code: 200,
      compute_ms: computeMs,
      app_id: appSource,
      payload: { success: true, to: toEmail, subject: emailSubject, id: emailItData.id }
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: `Email successfully sent to ${toEmail}`,
        id: emailItData.id,
      }),
      {
        headers: edgeHeaders,
      },
    );"""

new_email_block = """    // 4. Send Email via Dual-Provider Dispatch Manager
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
    );"""

start_idx = content.find(emailit_block_start)
end_idx = content.find(emailit_block_end) + len(emailit_block_end)

if start_idx != -1 and end_idx != -1:
    content = content[:start_idx] + new_email_block + content[end_idx:]

with open('supabase/functions/send-email/index.ts', 'w') as f:
    f.write(content)
