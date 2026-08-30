import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { EmailDispatchManager } from '../_shared/EmailDispatchManager.ts';

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") as string,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string,
);

serve(async (req) => {
  const authHeader = req.headers.get("Authorization");
  if (authHeader !== `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const max_retries = 3;

    // 1. Query public.dead_letter_jobs where retry_count < max_retries
    // We also select status = 'Pending' or 'Failed' (not EXHAUSTED)
    const { data: dlqJobs, error: fetchError } = await supabase
      .from('dead_letter_jobs')
      .select('*')
      .neq('status', 'EXHAUSTED')
      .lt('retry_count', max_retries);

    if (fetchError) throw new Error(`Failed to fetch DLQ jobs: ${fetchError.message}`);

    if (!dlqJobs || dlqJobs.length === 0) {
      return new Response(JSON.stringify({ message: "No qualifying DLQ jobs to process" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    console.log(`Found ${dlqJobs.length} DLQ jobs to evaluate.`);

    const emailitApiKey = Deno.env.get("EMAILIT_API_KEY") || '';
    const resendApiKey = Deno.env.get("RESEND_API_KEY") || '';
    const emailManager = new EmailDispatchManager(emailitApiKey, resendApiKey);

    for (const job of dlqJobs) {
      const currentRetryCount = job.retry_count || 0;
      const newRetryCount = currentRetryCount + 1;

      if (newRetryCount >= max_retries) {
        // 3. Mark as EXHAUSTED and dispatch alert email
        await supabase.from("dead_letter_jobs")
          .update({
             status: 'EXHAUSTED',
             retry_count: newRetryCount,
             updated_at: new Date().toISOString()
          })
          .eq('id', job.id);

        await supabase.from("hitl_dead_letter_logs").insert({
          original_job_id: job.id,
          app_id: job.app_id,
          task_type: job.task_type || 'unknown',
          payload: job.payload,
          error_log: job.error_log,
          diagnostic_payload: {
            reason: "Exhausted all DLQ retries",
            job_details: job,
            last_error: job.error_log
          },
          status: 'Pending_HITL_Review'
        });

        await supabase.from("telemetry_events").insert({
          component_id: 'core_api',
          severity: 'FATAL',
          message: `Job ${job.id} exhausted retries and marked EXHAUSTED`,
          error_code: 'JOB_DLQ_EXHAUSTED',
          payload: { job_id: job.id, app_id: job.app_id, error_log: job.error_log }
        });

        // Dispatch alert email
        try {
            await emailManager.send({
                from: "System Alerts <alerts@axim.us.com>",
                to: ["support@axim.us.com"],
                subject: `[URGENT] DLQ Job Exhausted: ${job.task_type}`,
                html: `<h1>Dead Letter Job Exhausted</h1>
                       <p>Job ID: ${job.id}</p>
                       <p>App ID: ${job.app_id}</p>
                       <p>Task Type: ${job.task_type}</p>
                       <p>Error: ${job.error_log}</p>
                       <p>Please review immediately in the HITL dashboard.</p>`
            });
        } catch (e) {
            console.error("Failed to send alert email for job", job.id, e);
        }

      } else {
        // 2. Re-queue eligible jobs into public.scheduled_tasks with exponential backoff
        const backoffMinutes = Math.pow(5, currentRetryCount + 1); // e.g. 5 min, 25 min, 125 min
        const nextRunAt = new Date(Date.now() + backoffMinutes * 60000).toISOString();

        const { error: requeueError } = await supabase.from('scheduled_tasks').insert({
            app_id: job.app_id,
            task_type: job.task_type,
            payload: job.payload,
            status: 'pending',
            attempts: 0, // Reset attempts for the job processor
            next_run_at: nextRunAt
        });

        if (requeueError) {
            console.error(`Failed to requeue DLQ job ${job.id}:`, requeueError);
        } else {
            // Update DLQ record to indicate it's pending again or keep track of retry count
            await supabase.from('dead_letter_jobs')
              .update({
                  status: 'Requeued',
                  retry_count: newRetryCount,
                  updated_at: new Date().toISOString()
              })
              .eq('id', job.id);
        }
      }
    }

    return new Response(
      JSON.stringify({ message: `Evaluated ${dlqJobs.length} DLQ jobs` }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("dead_letter_jobs error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
