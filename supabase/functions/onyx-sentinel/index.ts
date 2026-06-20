import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Start a background listener to explicitly subscribe to the telemetry_alert_bus Postgres channel
async function subscribeToTelemetryAlertBus() {
  const dbUrl = Deno.env.get('DATABASE_URL') ?? Deno.env.get('SUPABASE_DB_URL');
  if (!dbUrl) {
    console.warn("No database URL provided for postgres client. Skipping telemetry_alert_bus subscription.");
    return;
  }

  try {
    const client = new Client(dbUrl);
    await client.connect();

    // Explicitly subscribe to the Postgres channel
    const channelName = "telemetry_alert_bus";
    const listenQuery = `LISTEN ${channelName};`;
    await client.queryArray(listenQuery);

    console.log(`[onyx-sentinel] Subscribed to Postgres channel: ${channelName}`);

    // Listen for notifications
    for await (const notification of client.waitForNotification()) {
      if (notification.channel === channelName) {
        console.log(`[onyx-sentinel] Received event on telemetry_alert_bus:`, notification.payload);
      }
    }
  } catch (error) {
    console.error(`[onyx-sentinel] Error in Postgres channel listener:`, error);
  }
}

// Start listener asynchronously (in a real Edge Function environment this may terminate when the request ends,
// but we include it per architectural directives for the sentinel service).
subscribeToTelemetryAlertBus().catch(console.error);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (req.method === 'POST') {
      const payload = await req.json();

      if (payload && payload.record && payload.record.status === 'offline') {
        const diagnosticPayload = {
          message: `Node ${payload.record.app_name} (${payload.record.id}) is offline.`,
          node_id: payload.record.id,
          app_name: payload.record.app_name,
          timestamp: new Date().toISOString()
        };

        const { error: insertError } = await supabase
          .from('hitl_audit_logs')
          .insert([{
            action_type: 'SYSTEM_ALERT',
            status: 'pending',
            details: diagnosticPayload,
            user_id: null
          }]);

        if (insertError) {
          console.error("Failed to insert into hitl_audit_logs", insertError);
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 405,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
