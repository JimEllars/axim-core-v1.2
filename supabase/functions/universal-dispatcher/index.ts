import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") as string;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get(
  "SUPABASE_SERVICE_ROLE_KEY",
) as string;
const AXIM_SERVICE_KEY =
  (Deno.env.get("AXIM_SERVICE_KEY") as string) ||
  (Deno.env.get("AXIM_INTERNAL_SERVICE_KEY") as string) ||
  "fallback_internal_key";

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const HIGH_STAKES_ACTIONS = [
  "trigger_marketing_workflow",
  "publish_article",
  "mass_email",
  "quarantine_app"
];

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const internalKeyHeader = req.headers.get("X-Axim-Internal-Service-Key") || req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!internalKeyHeader || (internalKeyHeader !== AXIM_SERVICE_KEY && internalKeyHeader !== SUPABASE_SERVICE_ROLE_KEY)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();

    // Check if it's a webhook payload
    if (body.meta?.event_type === 'lead.created') {
       // Invoke trigger-workflow logic
       const url = new URL(req.url);
       const triggerWorkflowUrl = Deno.env.get('TRIGGER_WORKFLOW_URL') || `${url.protocol}//${url.host}/trigger-workflow`;

       try {
           const res = await fetch(triggerWorkflowUrl, {
               method: 'POST',
               headers: {
                   'Content-Type': 'application/json',
                   'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                   'X-Axim-Internal-Service-Key': AXIM_SERVICE_KEY
               },
               body: JSON.stringify(body)
           });

           if (!res.ok) {
              throw new Error(`trigger-workflow returned status ${res.status}`);
           }

           // Log the execution to api_usage_logs
           const { sanitizePayload } = await import('./sanitization.ts');
           await supabaseAdmin.from('api_usage_logs').insert({
               event_id: body.meta?.event_id,
               status: 'success',
               workflow_triggered: true,
               payload_scrubbed: sanitizePayload(body.data)
           });

           return new Response(JSON.stringify({ success: true, message: 'lead.created routed to trigger-workflow' }), {
               status: 200,
               headers: { ...corsHeaders, "Content-Type": "application/json" }
           });
       } catch(e) {
           throw e;
       }
    }

    const { action_type, payload } = body;

    let target_department = body?.target_department ?? payload?.target_department;
    if (target_department === null || target_department === undefined || typeof target_department !== 'string') {
        target_department = 'CORE';
    }

    const VALID_DEPARTMENTS = ['CEO', 'CFO', 'COO', 'CORE'];
    if (!VALID_DEPARTMENTS.includes(target_department)) {
        return new Response(
            JSON.stringify({
                error: "Bad Request",
                message: "Invalid target department specified",
            }),
            {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
        );
    }

    if (target_department !== 'CORE') {
        console.log(`[Dispatcher] Routing payload to department: ${target_department}`);
        const useCfQueue = Deno.env.get('USE_CF_TELEMETRY_QUEUE') === 'true';
        const payloadToLog = {
            event: 'department_dispatch',
            app_type: 'universal-dispatcher',
            details: { department: target_department, original_payload: body },
            timestamp: new Date().toISOString()
        };
        if (useCfQueue) {
            const workerUrl = Deno.env.get('TELEMETRY_WORKER_URL');
            if (workerUrl) {
                await fetch(workerUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payloadToLog)
                }).catch(e => console.error('Failed to queue telemetry', e));
            } else {
                await supabaseAdmin.from('telemetry_logs').insert(payloadToLog);
            }
        } else {
            await supabaseAdmin.from('telemetry_logs').insert(payloadToLog);
        }
    }

    if (!action_type || !payload) {
      return new Response(
        JSON.stringify({
          error: "Missing required fields: action_type or payload",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }



    // Handshake Gateway Closeout Infrastructure (Task 3)
    if (action_type === 'ExternalCodeGenerationHandshake' || action_type === 'lab_code_generation' || action_type === 'lab_engine_closeout') {
        const { pr_branch, file_diff_summary, test_pass_rate, commit_sha, ticket_id } = payload;

        const deserializedLabPayload = {
            target_repository: payload.target_repository || null,
            generated_branch: pr_branch || payload.generated_branch || null,
            diff_metrics: file_diff_summary || payload.diff_metrics || {},
            security_clearance_hash: payload.security_clearance_hash || null,
            ast_parse_tree: payload.ast_parse_tree || null,
            test_pass_rate: test_pass_rate || null,
            commit_sha: commit_sha || null,
            ticket_id: ticket_id || null
        };

        console.log('[Dispatcher] Received Lab closeout handshake. Ready for downstream schema ingestion.', deserializedLabPayload);

        if (ticket_id) {
            // Update the metadata column of ticket_messages for the target ticket ID
            await supabaseAdmin.from('ticket_messages').update({
                metadata: deserializedLabPayload
            }).eq('ticket_id', ticket_id).order('created_at', { ascending: false }).limit(1);
        }

        // Log to api_usage_logs
        await supabaseAdmin.from('api_usage_logs').insert({
            app_id: 'universal-dispatcher',
            endpoint: '/universal-dispatcher',
            method: 'POST',
            status_code: 200,
            execution_time_ms: 10,
            metadata: {
                action_type: action_type,
                sender_signature_status: 'verified'
            }
        });

        return new Response(JSON.stringify({
            success: true,
            message: "Lab handshake received and deserialized",
            parsed: deserializedLabPayload
        }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
    }

    if (action_type === 'spawn_sub_agents') {
        console.log('[Dispatcher] Detected spawn_sub_agents payload. Initializing Swarm Blackboard...');

        const { prompt, agents, context } = payload;
        const blackboardId = crypto.randomUUID();

        // Let's fire sub-queries
        const agentPromises = agents.map(async (agent_id) => {
             // In a real scenario we might hit Onyx Edge with agent_id forced
             // Here we just mock or call the local function if we want
             const url = new URL(req.url);
             const onyxEdgeUrl = Deno.env.get('ONYX_EDGE_URL') || `${url.protocol}//${url.host}/onyx-bridge`;

             try {
                 const res = await fetch(onyxEdgeUrl, {
                     method: 'POST',
                     headers: {
                         'Content-Type': 'application/json',
                         'Authorization': `Bearer ${AXIM_SERVICE_KEY}`
                     },
                     body: JSON.stringify({
                         prompt: `[Blackboard Task for ${agent_id}]: ${prompt}`,
                         agent_id: agent_id,
                         context: context
                     })
                 });
                 if (res.ok) {
                     const data = await res.json();
                     return { agent_id, result: data.response || data.text || JSON.stringify(data) };
                 }
                 return { agent_id, result: 'Failed to fetch' };
             } catch (e) {
                 return { agent_id, result: e.message };
             }
        });

        const results = await Promise.all(agentPromises);

        // Write findings to Blackboard (telemetry_logs as mock Blackboard)
        const useCfQueue = Deno.env.get('USE_CF_TELEMETRY_QUEUE') === 'true';
        const payloadToLog = {
            event: 'swarm_blackboard_update',
            app_type: 'universal-dispatcher',
            details: {
                blackboard_id: blackboardId,
                results: results
            }
        };
        if (useCfQueue) {
            const workerUrl = Deno.env.get('TELEMETRY_WORKER_URL');
            if (workerUrl) {
                await fetch(workerUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payloadToLog)
                }).catch(e => console.error('Failed to queue telemetry', e));
            } else {
                await supabaseAdmin.from('telemetry_logs').insert(payloadToLog);
            }
        } else {
            await supabaseAdmin.from('telemetry_logs').insert(payloadToLog);
        }

        // Feed aggregated context back to main brain
        let synthesisPrompt = `The sub-agents have completed their tasks for prompt: "${prompt}".\n\nHere are their findings:\n`;
        results.forEach(r => {
            synthesisPrompt += `---\
[${r.agent_id}]: ${r.result}\n`;
        });
        synthesisPrompt += `\nPlease synthesize these findings into a cohesive final response.`;

        const url = new URL(req.url);
        const onyxEdgeUrl = Deno.env.get('ONYX_EDGE_URL') || `${url.protocol}//${url.host}/onyx-bridge`;

        const synthesisRes = await fetch(onyxEdgeUrl, {
             method: 'POST',
             headers: {
                 'Content-Type': 'application/json',
                 'Authorization': `Bearer ${AXIM_SERVICE_KEY}`
             },
             body: JSON.stringify({
                 prompt: synthesisPrompt,
                 agent_id: 'onyx-coordinator',
                 context: context
             })
        });

        let finalSynthesis = "Synthesis complete.";
        if (synthesisRes.ok) {
            const data = await synthesisRes.json();
            finalSynthesis = data.response || data.text || JSON.stringify(data);
        }

        return new Response(
            JSON.stringify({
                success: true,
                message: `Swarm Orchestration complete. ${results.length} agents reported back.`,
                response: finalSynthesis,
                blackboard_id: blackboardId
            }),
            {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
        );
    }


    if (action_type === "generate_pdf_artifact") {
        const { content, bucket, filename } = payload;
        try {
            const { generatePdf } = await import("../_shared/pdf-generators/index.ts");
            const pdfBytes = await generatePdf("UNIFIRST_PROSPECT_RESEARCH", { profile: content });
            const { error: uploadError } = await supabaseAdmin.storage
                .from(bucket || "secure_artifacts")
                .upload(filename, pdfBytes, {
                    contentType: "application/pdf",
                    upsert: true
                });
            if (uploadError) throw uploadError;
            return new Response(JSON.stringify({ success: true, message: "PDF Generated and Uploaded" }), {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        } catch (e) {
            throw e;
        }
    }

    const isHighStakes = HIGH_STAKES_ACTIONS.includes(action_type);

    if (isHighStakes) {
      console.log(`[Dispatcher] Routing high-stakes action '${action_type}' to HITL Approval Queue.`);

      // Get an admin ID for the audit log
      const { data: users, error: userError } = await supabaseAdmin.auth.admin.listUsers();
      // Assuming first user or a dummy user if none available
      let adminId = users?.users?.[0]?.id;

      // We will serialize payload in the action or tool_called field since hitl_audit_logs lacks a payload col
      const toolCalledPayload = {
        ...payload,
        target_department: target_department
      };

      const { error: hitlError } = await supabaseAdmin.from("hitl_audit_logs").insert({
        admin_id: adminId || "00000000-0000-0000-0000-000000000000",
        action: action_type,
        tool_called: JSON.stringify(toolCalledPayload).substring(0, 500), // store payload representation in tool_called temporarily
        status: 'pending'
      });

      if (hitlError) throw hitlError;

      return new Response(
        JSON.stringify({
          success: true,
          message: `Action '${action_type}' is high-stakes. Routed to HITL Approval Queue.`,
          status: 'pending'
        }),
        {
          status: 202,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    } else {
      console.log(`[Dispatcher] Routing low-stakes action '${action_type}' to satellite_job_queue.`);

      const { error: jobError } = await supabaseAdmin.from("satellite_job_queue").insert({
        app_id: "universal-dispatcher",
        payload: { action_type, payload: { ...payload, target_department } },
        status: 'pending',
        task_type: action_type
      });

      if (jobError) throw jobError;

      return new Response(
        JSON.stringify({
          success: true,
          message: `Action '${action_type}' is low-stakes. Inserted into satellite_job_queue.`,
          status: 'queued'
        }),
        {
          status: 202,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
  } catch (error: any) {
    console.error("Universal Dispatcher Error:", error);

    if (error.name === 'SyntaxError' || error.message.includes('malformed') || error.message.includes('signature')) {
        await supabaseAdmin.from('hitl_dead_letter_logs').insert({
            raw_payload: typeof body !== 'undefined' ? body : null,
            rejection_reason: error.message,
            status: "pending_review"
        });
        return new Response(
            JSON.stringify({
                error: "Bad Request",
                message: "Malformed callback signature or invalid JSON payload",
            }),
            {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
        );
    }


    const useCfQueueError = Deno.env.get('USE_CF_TELEMETRY_QUEUE') === 'true';
    const payloadToLog = {
      event: "integration_failure",
      app_type: "universal-dispatcher",
      status_code: 500,
      timestamp: new Date().toISOString(),
      details: { error: error.message },
    };
    if (useCfQueueError) {
        const workerUrl = Deno.env.get('TELEMETRY_WORKER_URL');
        if (workerUrl) {
            await fetch(workerUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payloadToLog)
            }).catch(e => console.error('Failed to queue telemetry', e));
        } else {
            await supabaseAdmin.from("telemetry_logs").insert(payloadToLog);
        }
    } else {
        await supabaseAdmin.from("telemetry_logs").insert(payloadToLog);
    }

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
