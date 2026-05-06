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
            // Logic for crm_sync
        } else if (jobType === 'ingest_knowledge') {
            console.log(`Processing ingest_knowledge for job ${job.id}`);
            // Logic for ingest_knowledge
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
        const newStatus = newAttempts >= job.max_attempts ? "failed" : "failed"; // We set to failed, the fetch query picks up failed if attempts < max

        await supabase
          .from("satellite_job_queue")
          .update({
            status: newStatus,
            attempts: newAttempts,
            error_log: err instanceof Error ? err.message : String(err),
          })
          .eq("id", job.id);

        if (newAttempts >= job.max_attempts) {
          await supabase.from("telemetry_logs").insert({
            event: "critical_job_failure",
            app_type: "job-processor",
            timestamp: new Date().toISOString(),
            details: {
              error: err instanceof Error ? err.message : String(err),
              job_id: job.id,
              payload: job.payload,
            },
          });
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
