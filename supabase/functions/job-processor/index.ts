import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { generatePdf } from "../_shared/pdf-generators/index.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") as string,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string,
);

const supabaseUrl = Deno.env.get("SUPABASE_URL") as string;

serve(async (req) => {
  // Simple auth for cron/internal triggering
  const authHeader = req.headers.get("Authorization");
  if (authHeader !== `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    // 1. Fetch Pending Jobs (max 10) safely using our RPC function
    const { data: jobs, error: fetchError } = await supabase.rpc(
      "dequeue_satellite_jobs",
      { max_jobs: 10 },
    );

    if (fetchError) {
      throw new Error(`Failed to fetch jobs: ${fetchError.message}`);
    }

    if (!jobs || jobs.length === 0) {
      return new Response(
        JSON.stringify({ message: "No pending jobs found" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    console.log(`Processing ${jobs.length} jobs`);

    // Process jobs
    for (const job of jobs) {
      try {
        const { app_id, payload, task_type } = job;
        const jobType = task_type || payload?.job_type;
        const idempotencyKey = payload?.idempotency_key;

        // Enforce Idempotency
        if (idempotencyKey) {
          const { data: existingLog, error: idempError } = await supabase
            .from("api_usage_logs")
            .select("id")
            .eq("idempotency_key", idempotencyKey)
            .single();

          if (existingLog) {
             console.log(`Job ${job.id} skipped. Duplicate idempotency_key: ${idempotencyKey}`);
             await supabase
               .from("satellite_job_queue")
               .update({ status: "completed", error_log: "Skipped as duplicate (idempotency_key match)" })
               .eq("id", job.id);
             continue;
          }
        }

        let artifactUrl = "";

        // Execute logic based on job_type or task_type
        if (jobType === 'omnichannel_post') {
            console.log(`Processing omnichannel_post for job ${job.id}`);
            // Logic for omnichannel_post (e.g., calling the appropriate webhook or API)
            // Simulating execution
                } else if (jobType === 'crm_sync') {
            console.log(`Processing crm_sync for job ${job.id}`);
            const { contact_id, email, executive_summary, crm_integration_id } = payload || {};

            if (!crm_integration_id || !executive_summary || !email) {
               console.error(`Missing required fields for crm_sync job ${job.id}`);
               continue;
            }

            const idempotencyKey = payload?.idempotency_key || `crm_sync_${job.id}`;

            // Use the generic axim proxy service pattern through standard fetch to the api-proxy
            const proxyUrl = `${supabaseUrl}/functions/v1/api-proxy`;
            const proxyRes = await fetch(proxyUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              },
              body: JSON.stringify({
                integrationId: crm_integration_id,
                endpoint: `/contact/update/${encodeURIComponent(email)}`, // Generalized endpoint pattern
                method: 'PUT',
                body: {
                  notes: executive_summary,
                  description: executive_summary
                },
                headers: {
                  'Idempotency-Key': idempotencyKey
                }
              })
            });

            if (!proxyRes.ok) {
              const errText = await proxyRes.text();
              throw new Error(`CRM Proxy Error: ${proxyRes.status} - ${errText}`);
            }
            console.log(`Successfully synced Executive Summary to CRM for ${email}`);
        } else if (jobType === 'ingest_knowledge') {
            console.log(`Processing ingest_knowledge for job ${job.id}`);
            // Logic for ingest_knowledge
        } else if (jobType === 'scheduled_task') {
            console.log(`Processing scheduled_task for job ${job.id}`);
            const command = payload?.command;
            const userId = payload?.user_id;
            if (!command) throw new Error('Missing command for scheduled_task');

            // Execute using trigger-workflow or via proxy
            const triggerUrl = `${supabaseUrl}/functions/v1/trigger-workflow`;
            const triggerRes = await fetch(triggerUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              },
              body: JSON.stringify({
                workflowName: command,
                userId: userId || 'system',
                context: { triggered_by: 'job-processor' }
              })
            });

            if (!triggerRes.ok) {
              const errText = await triggerRes.text();
              throw new Error(`Workflow Trigger Error: ${triggerRes.status} - ${errText}`);
            }
            console.log(`Successfully executed scheduled workflow ${command}`);
        } else if (jobType === 'backfill_embedding') {
            console.log(`Processing backfill_embedding for job ${job.id}`);
            const interactionId = payload?.interaction_id;
            if (!interactionId) throw new Error('Missing interaction_id');

            const { data: interaction, error: intError } = await supabase
                .from('ai_interactions_ax2024')
                .select('command, response')
                .eq('id', interactionId)
                .single();
            if (intError) throw new Error(`Fetch interaction error: ${intError.message}`);
            if (!interaction) {
                console.log(`Interaction ${interactionId} not found, skipping.`);
            } else {
                const textToEmbed = interaction.command + (interaction.response ? ' ' + interaction.response : '');
                const embedRes = await fetch(`${supabaseUrl}/functions/v1/generate-embedding`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
                    },
                    body: JSON.stringify({ input: textToEmbed })
                });
                if (embedRes.ok) {
                    const embedData = await embedRes.json();
                    if (embedData.embedding) {
                        const { error: updError } = await supabase
                            .from('ai_interactions_ax2024')
                            .update({ embedding: embedData.embedding })
                            .eq('id', interactionId);
                        if (updError) throw new Error(`Update interaction error: ${updError.message}`);
                        console.log(`Successfully backfilled embedding for interaction ${interactionId}`);
                    } else {
                        console.log(`No embedding returned for interaction ${interactionId}`);
                    }
                } else {
                    throw new Error(`Embedding proxy error: ${embedRes.status}`);
                }
            }
        } else if (jobType === "generate_nda" || jobType === "generate_demand_letter" || app_id) {
          console.log(
            `Triggering generator for app ${app_id || jobType} (Job: ${job.id})...`,
          );

          const { formData, session_id, customer_email } = payload || {};

          // Using the shared pdf-generator utility directly instead of fetching
          const pdfBytes = await generatePdf(
            app_id || jobType,
            formData || payload,
          );

          if (pdfBytes) {
            const fileName = `${app_id || jobType}_${session_id || crypto.randomUUID()}.pdf`;

            const { error: uploadError } = await supabase.storage
              .from("secure_artifacts")
              .upload(fileName, pdfBytes, {
                contentType: "application/pdf",
                upsert: true,
              });

            if (uploadError) {
              throw new Error(
                `Failed to store artifact: ${uploadError.message}`,
              );
            }

            const { data: signedUrlData, error: signedUrlError } =
              await supabase.storage
                .from("secure_artifacts")
                .createSignedUrl(fileName, 60 * 60 * 24 * 7);

            if (signedUrlError) {
              throw new Error(
                `Failed to generate signed url: ${signedUrlError.message}`,
              );
            }

            artifactUrl = signedUrlData.signedUrl;

            await supabase.from("vault_records").insert({
              file_name: fileName,
              document_type: app_id || jobType,
              trace_id: session_id,
              bucket_id: "secure_artifacts",
            });
          }

          // Send Email using the updated send-email edge function
          if (customer_email) {
            const dispatcherUrl = `${supabaseUrl}/functions/v1/send-email`;
            const dispatchRes = await fetch(dispatcherUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              },
              body: JSON.stringify({
                email: customer_email,
                app_source: app_id || jobType || "system",
                formData: formData || payload,
                artifactUrl: artifactUrl,
              }),
            });

            if (!dispatchRes.ok) {
              throw new Error(
                `Failed to dispatch email: ${await dispatchRes.text()}`,
              );
            }
          }
        }

        // Record Idempotency Key if present and successful
        if (idempotencyKey) {
            await supabase.from("api_usage_logs").insert({
               endpoint: `/satellite_job_queue/${jobType || 'unknown'}`,
               idempotency_key: idempotencyKey
            });
        }

        // Mark Job as Completed
        await supabase
          .from("satellite_job_queue")
          .update({ status: "completed" })
          .eq("id", job.id);

        console.log(`Job ${job.id} completed successfully.`);
      } catch (err: any) {
        console.error(`Error processing job ${job.id}:`, err);
        const newAttempts = job.attempts + 1;
        const newStatus = newAttempts >= job.max_attempts ? "failed" : "pending";

        const backoffMinutes = Math.pow(5, job.attempts); // attempt 1 -> 5^0 = 1 min, 5^1 = 5 min, 5^2 = 25 min...
        const nextRunAt = new Date(Date.now() + backoffMinutes * 60000).toISOString();

        if (newAttempts >= job.max_attempts) {
          // Remove from satellite_job_queue
          await supabase.from("satellite_job_queue").delete().eq("id", job.id);

          // Insert into dead_letter_jobs
          await supabase.from("dead_letter_jobs").insert({
            original_job_id: job.id,
            app_id: job.app_id,
            task_type: job.task_type || jobType || 'unknown',
            payload: job.payload,
            error_log: err instanceof Error ? err.message : String(err),
            status: 'Pending'
          });

          await supabase.from("telemetry_events").insert({
            component_id: 'job_processor',
            severity: 'FATAL',
            message: `DLQ entry created for job ${job.id}`,
            error_code: 'JOB_MAX_ATTEMPTS',
            payload: { job_id: job.id, error_log: err instanceof Error ? err.message : String(err) }
          });

          await supabase.from("telemetry_logs").insert({
            event: "critical_job_failure",
            app_type: "job-processor",
            timestamp: new Date().toISOString(),
            details: {
              error: err instanceof Error ? err.message : String(err),
              job_id: job.id,
              payload: job.payload,
              dlq: true
            },
          });
        } else {
          // Update satellite_job_queue
          await supabase
            .from("satellite_job_queue")
            .update({
              status: newStatus,
              attempts: newAttempts,
              next_run_at: nextRunAt,
              error_log: err instanceof Error ? err.message : String(err),
            })
            .eq("id", job.id);
        }
      }
    }

    return new Response(
      JSON.stringify({ message: `Processed ${jobs.length} jobs` }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("Job processor critical error:", err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : String(err),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
