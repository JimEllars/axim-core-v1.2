import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') as string,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string
);

const internalKey = Deno.env.get('AXIM_INTERNAL_SERVICE_KEY') || 'fallback_internal_key';
const supabaseUrl = Deno.env.get('SUPABASE_URL') as string;
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY'); // Assuming OpenAI is available, adjust if Gemini/Claude is preferred

serve(async (req) => {
  // Simple auth for cron/internal triggering
  const authHeader = req.headers.get('Authorization');
  if (authHeader !== `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();

    // 1. Fetch Failed Queue Jobs
    const { data: failedJobs, error: jobsError } = await supabase
      .from('satellite_job_queue')
      .select('app_id, error_log')
      .eq('status', 'failed')
      .gte('updated_at', fifteenMinutesAgo);

    if (jobsError) throw new Error(`Failed to fetch jobs: ${jobsError.message}`);

    // 2. Fetch Critical Telemetry Errors
    const { data: criticalLogs, error: logsError } = await supabase
      .from('telemetry_logs')
      .select('app_type, details')
      .eq('event', 'critical_job_failure') // or any other critical event types
      .gte('timestamp', fifteenMinutesAgo);

    if (logsError) throw new Error(`Failed to fetch telemetry logs: ${logsError.message}`);

    const hasAnomalies = (failedJobs && failedJobs.length > 0) || (criticalLogs && criticalLogs.length > 0);

    if (!hasAnomalies) {
      return new Response(JSON.stringify({ status: 'ok', message: 'No critical anomalies detected.' }), { headers: { 'Content-Type': 'application/json' } });
    }

    console.log(`Anomalies detected: ${failedJobs?.length || 0} failed jobs, ${criticalLogs?.length || 0} critical logs.`);

    // 3. Compile Data for LLM
    const anomalyReport = {
      failed_jobs: failedJobs,
      critical_logs: criticalLogs,
      timestamp: new Date().toISOString()
    };

    // 4. Ask LLM to generate urgent SMS
    let alertMessage = "Sentinel Alert: Critical failures detected in the AXiM Core. Please check Mission Control immediately."; // Fallback

    if (OPENAI_API_KEY) {
      try {
        const llmRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_API_KEY}`
          },
          body: JSON.stringify({
            model: "gpt-3.5-turbo",
            messages: [
              {
                role: "system",
                content: "You are Onyx Sentinel, the AI guardian for AXiM Core. You monitor internal systems. Write a very short, urgent SMS text message (max 160 characters) to the Executive Admin alerting them to the following system failures. Be specific about which app is failing if possible."
              },
              {
                role: "user",
                content: JSON.stringify(anomalyReport)
              }
            ],
            max_tokens: 60,
            temperature: 0.2
          })
        });

        if (llmRes.ok) {
          const llmData = await llmRes.json();
          if (llmData.choices && llmData.choices[0]?.message?.content) {
            alertMessage = llmData.choices[0].message.content.trim();
          }
        } else {
            console.error("LLM request failed:", await llmRes.text());
        }
      } catch (llmError) {
        console.error("Error calling LLM:", llmError);
      }
    } else {
        console.warn("OPENAI_API_KEY not set. Using fallback alert message.");
    }

    // 5. Dispatch SMS via universal-dispatcher
    const dispatcherUrl = `${supabaseUrl}/functions/v1/universal-dispatcher`;
    const dispatchRes = await fetch(dispatcherUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Axim-Internal-Service-Key': internalKey,
      },
      body: JSON.stringify({
        target_service: 'sms',
        action_type: 'send_sms',
        payload: {
          to: Deno.env.get('ADMIN_MOBILE_NUMBER') || '+10000000000', // Hardcoded requirement
          message: alertMessage
        },
      }),
    });

    if (!dispatchRes.ok) {
      throw new Error(`Failed to dispatch SMS alert: ${await dispatchRes.text()}`);
    }

    console.log(`Sentinel successfully dispatched SMS alert: "${alertMessage}"`);
    return new Response(JSON.stringify({ status: 'alert_dispatched', message: alertMessage }), { headers: { 'Content-Type': 'application/json' } });

  } catch (err: any) {
    console.error('Onyx Sentinel critical error:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
