
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const supabase = createClient(
  supabaseUrl as string,
  serviceRoleKey as string
);

serve(async (req) => {
  try {
    const payload = await req.json();

    // Onyx anomaly evaluation payload
    if (payload.anomaly) {
        const { appId, errorRate, total, errors, confidenceScore, incidentDetails } = payload.anomaly;
        console.log(`[Auto-Healer] Evaluating anomaly for ${appId}: ${(errorRate * 100).toFixed(2)}% error rate (${errors}/${total})`);

        // Check for confidence score and escalate to Claude Cowork if < 0.85
        if (confidenceScore !== undefined && confidenceScore < 0.85) {
            console.log(`[Auto-Healer] Confidence score ${confidenceScore} below 0.85. Escalating to Tier 4 Action Agent.`);

            // Build the handoff envelope
            const handoffEnvelope = {
                incident_id: incidentDetails?.incident_id || `err_${crypto.randomUUID().substring(0, 8)}`,
                target_application: {
                    app_id: appId || 'unknown-app',
                    runtime_environment: 'cloudflare_workers',
                    active_branch: 'main',
                    repository_source: incidentDetails?.repository_source || 'unknown-repo'
                },
                telemetry_context: {
                    endpoint: incidentDetails?.endpoint || '/unknown',
                    http_status: incidentDetails?.http_status || 500,
                    error_signature: incidentDetails?.error_signature || 'Unknown Error',
                    stack_trace: incidentDetails?.stack_trace || 'No stack trace available',
                    last_10_transaction_logs: incidentDetails?.last_10_transaction_logs || []
                },
                sandboxed_workspace_rules: {
                    allowed_file_paths: [
                        'worker.js',
                        'wrangler.jsonc',
                        'src/utils/paymentService.js'
                    ],
                    verification_command: 'npm run test && npm run build',
                    max_execution_time_seconds: 180,
                    quota_token_allocation: 45000
                },
                security_mask: {
                    stripped_variables: ["STRIPE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"],
                    mock_variable_stubs: {
                        STRIPE_SECRET_KEY: "sk_test_mock_axim_cowork_string",
                        SUPABASE_SERVICE_ROLE_KEY: "sb_mock_service_role"
                    }
                }
            };

            // Dispatch alert to hitl_audit_logs for the handoff
            await supabase.from('hitl_audit_logs').insert({
                admin_id: "00000000-0000-0000-0000-000000000000",
                action: "tier4_escalation",
                tool_called: JSON.stringify(handoffEnvelope),
                status: "pending"
            });

            return new Response(JSON.stringify({ success: true, message: `Escalated to Tier 4 Action Agent for ${appId}.`, envelope: handoffEnvelope }), { status: 200 });
        }

        // Traffic spike or crash loop?
        // Assuming high total with somewhat low error count is a traffic spike
        if (total > 1000 && errorRate <= 0.10) {
            console.log(`[Auto-Healer] Detected traffic spike for ${appId}. Logging scaling recommendation.`);
            // Insert log recommendation
            await supabase.from('hitl_audit_logs').insert({
                admin_id: "00000000-0000-0000-0000-000000000000",
                action: "scaling_recommendation",
                tool_called: JSON.stringify({ app_id: appId, recommendation: "Increase compute resources or instances." }),
                status: "pending"
            });
            return new Response(JSON.stringify({ success: true, message: `Scaling recommendation logged for ${appId}` }), { status: 200 });
        } else {
            console.log(`[Auto-Healer] Detected crash loop for ${appId}. Quarantining app.`);

            // Execute quarantine_app action
            await supabase.from('ecosystem_apps').update({ status: 'offline' }).eq('app_id', appId);

            // Dispatch alert to hitl_audit_logs
            await supabase.from('hitl_audit_logs').insert({
                admin_id: "00000000-0000-0000-0000-000000000000",
                action: "quarantine_app",
                tool_called: JSON.stringify({ app_id: appId, reason: "Crash loop detected by auto-healer." }),
                status: "pending"
            });
            return new Response(JSON.stringify({ success: true, message: `App ${appId} quarantined.` }), { status: 200 });
        }
    }

    // Original logic fallback
    const record = payload.record;

    if (!record || record.event !== 'uptime_failure') {
      return new Response(JSON.stringify({ message: "Ignored non-failure event" }), { status: 200 });
    }

    const url = record.details?.url || record.details?.target_url || record.details?.endpoint;

    if (!url) {
      console.warn("No URL found in telemetry log details.");
      return new Response(JSON.stringify({ error: "No URL found in payload" }), { status: 400 });
    }

    const prompt = `CRITICAL: Micro-app ${url} is offline. Execute your Cloudflare Cache Purge tool. Then, verify the URL status. If it is still down after 30 seconds, escalate to the Admin.`;

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing Supabase configuration");
    }

    console.log(`[Auto-Healer] Triggering Onyx for ${url}`);

    const onyxResponse = await fetch(`${supabaseUrl}/functions/v1/onyx-bridge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`
      },
      body: JSON.stringify({ prompt })
    });

    if (!onyxResponse.ok) {
      console.error(`[Auto-Healer] Onyx bridge failed: ${onyxResponse.statusText}`);
      return new Response(JSON.stringify({ error: "Failed to trigger Onyx" }), { status: 500 });
    }

    return new Response(JSON.stringify({ success: true, message: `Triggered auto-healer for ${url}` }), { status: 200 });

  } catch (error) {
    console.error(`[Auto-Healer] Error: ${error.message}`);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});
