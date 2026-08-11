import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") as string;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string;

// Note: send-email endpoint URL is typically available from the same project or configured via env
// For simulation, we'll invoke the send-email edge function endpoint.
const SEND_EMAIL_URL = Deno.env.get("SEND_EMAIL_URL") || `${SUPABASE_URL}/functions/v1/send-email`;
// Note: In development/local it might be different, but assuming standard Supabase setup.
// If SEND_EMAIL_URL is not set, we construct it. But we actually just use fetch locally or external.
// A common pattern is to just call `supabaseAdmin.functions.invoke('send-email')`

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(async (req) => {
    try {
        console.log("Starting campaign processor...");

        // 1. Query active enrollments
        const { data: enrollments, error: enrollmentsError } = await supabaseAdmin
            .from('crm_sequence_enrollments')
            .select(`
                id,
                lead_id,
                current_step,
                last_processed_at,
                crm_sequences ( steps ),
                nexus_leads ( email )
            `)
            .eq('status', 'active');

        if (enrollmentsError) {
            throw new Error(`Failed to fetch enrollments: ${enrollmentsError.message}`);
        }

        console.log(`Found ${enrollments?.length || 0} active enrollments.`);

        let processedCount = 0;

        // 2. Loop through enrollments
        for (const enrollment of enrollments || []) {
            try {
                const steps = enrollment.crm_sequences?.steps || [];
                const currentStepIndex = enrollment.current_step;

                // If current step exceeds array length, complete it
                if (currentStepIndex >= steps.length) {
                    await supabaseAdmin
                        .from('crm_sequence_enrollments')
                        .update({ status: 'completed' })
                        .eq('id', enrollment.id);
                    continue;
                }

                const step = steps[currentStepIndex];
                const leadEmail = enrollment.nexus_leads?.email;

                if (!leadEmail) {
                    console.warn(`Enrollment ${enrollment.id} has no lead email. Marking paused.`);
                    await supabaseAdmin
                        .from('crm_sequence_enrollments')
                        .update({ status: 'paused' })
                        .eq('id', enrollment.id);
                    continue;
                }

                // Check delay
                const delayDays = step.delay_days || 0;
                let readyToSend = false;

                if (!enrollment.last_processed_at) {
                    readyToSend = true; // First step
                } else {
                    const lastProcessed = new Date(enrollment.last_processed_at);
                    const now = new Date();
                    const diffTime = Math.abs(now.getTime() - lastProcessed.getTime());
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                    if (diffDays >= delayDays) {
                        readyToSend = true;
                    }
                }

                if (readyToSend) {
                    // 3. Invoke send-email function
                    // We simulate send-email function call. Since send-email is an edge function,
                    // we can use supabase.functions.invoke.
                    // Important: Ensure VITE_PRODUCTION_STAGING is handled if needed or rely on send-email simulation

                    const { error: invokeError } = await supabaseAdmin.functions.invoke('send-email', {
                        body: {
                            to_email: leadEmail,
                            subject: step.subject || 'Automated Campaign Follow-up',
                            html_content: step.html_content || '<p>Hello!</p>',
                            app_source: 'campaign-processor'
                        }
                    });

                    if (invokeError) {
                        console.error(`Failed to invoke send-email for enrollment ${enrollment.id}: ${invokeError.message}`);
                        continue;
                    }

                    // 4. Increment current_step and update last_processed_at
                    const nextStep = currentStepIndex + 1;
                    const status = nextStep >= steps.length ? 'completed' : 'active';

                    await supabaseAdmin
                        .from('crm_sequence_enrollments')
                        .update({
                            current_step: nextStep,
                            last_processed_at: new Date().toISOString(),
                            status: status
                        })
                        .eq('id', enrollment.id);

                    processedCount++;
                }

            } catch (innerError) {
                console.error(`Error processing enrollment ${enrollment.id}:`, innerError);
            }
        }

        // 5. Log the processing event to api_usage_logs
        await supabaseAdmin.from("api_usage_logs").insert({
            endpoint: "/campaign-processor",
            app_id: "axim-campaign-processor",
            status_code: 200,
            execution_time_ms: 0,
            request_payload: {
                action: "campaign_sequence_processed",
                processed_count: processedCount
            }
        });

        return new Response(JSON.stringify({ success: true, processed: processedCount }), {
            headers: { "Content-Type": "application/json" }
        });

    } catch (error: any) {
        console.error("Campaign processor error:", error);

        try {
            await supabaseAdmin.from("api_usage_logs").insert({
                endpoint: "/campaign-processor",
                app_id: "axim-campaign-processor",
                status_code: 500,
                execution_time_ms: 0,
                request_payload: { error: error.message }
            });
        } catch (e) {
            // ignore logging error
        }

        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
});
