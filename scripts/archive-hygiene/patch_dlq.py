import re

with open("supabase/functions/dead_letter_jobs/index.ts", "r") as f:
    content = f.read()

# Replace the EXHAUSTED block logic to include pg_notify_rpc
search_str = """        await supabase.from("hitl_dead_letter_logs").insert({
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
        });"""

replace_str = """        await supabase.from("hitl_dead_letter_logs").insert({
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

        // Broadcast DLQ Exhaustion over SSE via telemetry_events
        const notifyPayload = {
          event_type: "dlq.job_exhausted",
          job_id: job.id,
          payload_type: job.task_type,
          error: job.error_log,
          timestamp: new Date().toISOString()
        };
        await supabase.rpc('pg_notify_rpc', {
          channel: 'telemetry_events',
          payload: JSON.stringify(notifyPayload)
        });"""

if search_str in content:
    content = content.replace(search_str, replace_str)
else:
    print("Could not find the target string in DLQ index.ts")

with open("supabase/functions/dead_letter_jobs/index.ts", "w") as f:
    f.write(content)
