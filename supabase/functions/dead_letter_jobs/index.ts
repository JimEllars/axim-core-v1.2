import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

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
    // 1. In dead_letter_jobs/index.ts, implement an automated retry loop querying public.satellite_job_queue
    // for records with status = 'failed' and retry_count < 3.
    const { data: failedJobs, error: fetchError } = await supabase
      .from('satellite_job_queue')
      .select('*')
      .eq('status', 'failed')
      .lt('retry_count', 3);

    if (fetchError) throw new Error(`Failed to fetch failed jobs: ${fetchError.message}`);

    if (!failedJobs || failedJobs.length === 0) {
      return new Response(JSON.stringify({ message: "No failed jobs to retry" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    console.log(`Found ${failedJobs.length} failed jobs to evaluate.`);

    for (const job of failedJobs) {
      const newRetryCount = (job.retry_count || 0) + 1;

      if (newRetryCount >= 3) {
        // 3. If retry_count >= 3, route the failed record to public.hitl_dead_letter_logs
        // with a structured error diagnostic payload and emit an anomaly event to telemetry_events.

        await supabase.from("hitl_dead_letter_logs").insert({
          original_job_id: job.id,
          app_id: job.app_id,
          task_type: job.task_type || job.payload?.job_type || 'unknown',
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
          component_id: 'onyx_bridge', // or job_processor/dead_letter_jobs
          severity: 'FATAL',
          message: `Job ${job.id} exhausted retries and routed to HITL`,
          error_code: 'JOB_DLQ_EXHAUSTED',
          payload: { job_id: job.id, app_id: job.app_id, error_log: job.error_log }
        });

        // Also mark it permanently failed or remove it from queue
        // We can just delete it or mark status='dead'
        // Let's delete it or just leave it since the prompt didn't say, wait the prompt says:
        // "route the failed record to public.hitl_dead_letter_logs with a structured error diagnostic payload and emit an anomaly event to telemetry_events."
        // We should probably delete it from satellite_job_queue since it's routed.
        // mark it permanently failed
        await supabase.from('satellite_job_queue').update({ status: 'Failed', updated_at: new Date().toISOString() }).eq('id', job.id);
      } else {
        // 2. For qualifying records, reset status = 'pending', increment retry_count = retry_count + 1,
        // and update updated_at timestamps to allow job-processor to re-evaluate them cleanly.

        await supabase.from('satellite_job_queue')
          .update({
            status: 'pending',
            retry_count: newRetryCount,
            updated_at: new Date().toISOString()
          })
          .eq('id', job.id);
      }
    }

    return new Response(
      JSON.stringify({ message: `Evaluated ${failedJobs.length} failed jobs` }),
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
