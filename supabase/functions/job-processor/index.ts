import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { generatePdf } from "../_shared/pdf-generators/index.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") as string,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string,
);

const supabaseUrl = Deno.env.get("SUPABASE_URL") as string;

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
  // Simple auth for cron/internal triggering
  const authHeader = req.headers.get("Authorization");
  if (authHeader !== `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    // 1. Fetch Pending Jobs (max 10) safely using our RPC function
    // We update the function to use the rpc call to dequeue_satellite_jobs which uses FOR UPDATE SKIP LOCKED
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
        const { product_id, customer_email, session_id, user_id, formData } =
          payload;

        let artifactUrl = "";

        if (
          task_type === "generate_nda" ||
          task_type === "generate_demand_letter" ||
          app_id
        ) {
          console.log(
            `Triggering generator for app ${app_id || task_type} (Job: ${job.id})...`,
          );

          // Using the shared pdf-generator utility directly instead of fetching
          const pdfBytes = await generatePdf(
            app_id || task_type,
            formData || payload,
          );

          if (pdfBytes) {
            const fileName = `${app_id || task_type}_${session_id || crypto.randomUUID()}.pdf`;

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
              document_type: app_id || task_type,
              trace_id: session_id,
              bucket_id: "secure_artifacts",
            });
          }
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
              app_source: app_id || task_type || "system",
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
