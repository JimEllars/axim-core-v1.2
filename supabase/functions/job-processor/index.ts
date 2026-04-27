import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') as string,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string
);

const internalKey = Deno.env.get('AXIM_INTERNAL_SERVICE_KEY') || 'fallback_internal_key';
const supabaseUrl = Deno.env.get('SUPABASE_URL') as string;

serve(async (req) => {
  // Simple auth for cron/internal triggering
  const authHeader = req.headers.get('Authorization');
  if (authHeader !== `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    // 1. Fetch Pending Jobs (max 10)
    const { data: jobs, error: fetchError } = await supabase
      .from('satellite_job_queue')
      .select('*')
      .or('status.eq.pending,and(status.eq.failed,attempts.lt.max_attempts)')
      .limit(10);

    if (fetchError) {
      throw new Error(`Failed to fetch jobs: ${fetchError.message}`);
    }

    if (!jobs || jobs.length === 0) {
      return new Response(JSON.stringify({ message: 'No pending jobs found' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    console.log(`Processing ${jobs.length} jobs`);

    // Process jobs
    for (const job of jobs) {
      try {
        // Mark as processing
        await supabase
          .from('satellite_job_queue')
          .update({ status: 'processing' })
          .eq('id', job.id);

        const { app_id, payload } = job;
        const { product_id, customer_email, session_id, user_id } = payload;

        let artifactUrl = '';

        if (app_id) {
            console.log(`Triggering satellite app ${app_id} for artifact generation (Job: ${job.id})...`);
            const appUrl = `${supabaseUrl}/functions/v1/${app_id}`;
            const appRes = await fetch(appUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Axim-Internal-Service-Key': internalKey,
              },
              body: JSON.stringify({
                action: 'generate_artifact',
                session_id,
                user_id,
                customer_email,
                product_id
              })
            });

            if (!appRes.ok) {
              throw new Error(`Satellite app ${app_id} failed generation: ${await appRes.text()}`);
            }

            const appData = await appRes.json();
            const artifactPdfBase64 = appData.artifact;

            if (artifactPdfBase64) {
              const fileName = `${app_id}_${session_id}.pdf`;
              const pdfBuffer = Uint8Array.from(atob(artifactPdfBase64), c => c.charCodeAt(0));

              const { error: uploadError } = await supabase.storage
                  .from('secure_artifacts')
                  .upload(fileName, pdfBuffer, {
                    contentType: 'application/pdf',
                    upsert: true
                  });

              if (uploadError) {
                throw new Error(`Failed to store artifact: ${uploadError.message}`);
              }

              const { data: signedUrlData, error: signedUrlError } = await supabase.storage
                  .from('secure_artifacts')
                  .createSignedUrl(fileName, 60 * 60 * 24 * 7);

              if (signedUrlError) {
                  throw new Error(`Failed to generate signed url: ${signedUrlError.message}`);
              }

              artifactUrl = signedUrlData.signedUrl;

              await supabase.from('vault_records').insert({
                  file_name: fileName,
                  document_type: app_id,
                  trace_id: session_id,
                  bucket_id: 'secure_artifacts'
              });
            }
        }

        // Update delivery status
        await supabase
          .from('product_deliveries')
          .update({ delivery_status: 'delivered' })
          .eq('stripe_session_id', session_id);

        // Send Email
        const dispatcherUrl = `${supabaseUrl}/functions/v1/universal-dispatcher`;
        const dispatchRes = await fetch(dispatcherUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Axim-Internal-Service-Key': internalKey,
          },
          body: JSON.stringify({
            target_service: 'email',
            action_type: 'send_email',
            payload: {
              to: customer_email,
              subject: `Your Secure Document Delivery`,
              text: `Thank you for your purchase. ${artifactUrl ? `Here is your secure document link (valid for 7 days): ${artifactUrl}` : 'Your product is ready.'}`,
              recipient: customer_email,
            },
          }),
        });

        if (!dispatchRes.ok) {
          throw new Error(`Failed to dispatch email: ${await dispatchRes.text()}`);
        }

        // Mark Job as Completed
        await supabase
          .from('satellite_job_queue')
          .update({ status: 'completed' })
          .eq('id', job.id);

        console.log(`Job ${job.id} completed successfully.`);

      } catch (err: any) {
        console.error(`Error processing job ${job.id}:`, err);
        const newAttempts = job.attempts + 1;
        const newStatus = newAttempts >= job.max_attempts ? 'failed' : 'failed'; // We set to failed, the fetch query picks up failed if attempts < max

        await supabase
          .from('satellite_job_queue')
          .update({
            status: newStatus,
            attempts: newAttempts,
            error_log: err instanceof Error ? err.message : String(err)
          })
          .eq('id', job.id);

        if (newAttempts >= job.max_attempts) {
           await supabase.from('telemetry_logs').insert({
              event: 'critical_job_failure',
              app_type: 'job-processor',
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

    return new Response(JSON.stringify({ message: `Processed ${jobs.length} jobs` }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (err: any) {
    console.error('Job processor critical error:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
