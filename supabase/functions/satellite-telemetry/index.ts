import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-axim-internal-service-key',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const internalKey = req.headers.get('x-axim-internal-service-key') || req.headers.get('x-axim-signature') || req.headers.get('x-satellite-signature');
  const expectedKey = Deno.env.get('AXIM_INTERNAL_SERVICE_KEY');

  if (!internalKey || internalKey !== expectedKey) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();
    const { app_id, event_type, execution_ms, error_stack, provider, prompt_tokens, completion_tokens, total_tokens, estimated_cost_usd } = body;

    if (!app_id || !event_type) {
      return new Response(JSON.stringify({ error: 'Missing required fields app_id or event_type' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const processSatelliteTelemetry = async () => {
      try {
        const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { error: telemetryError } = await supabaseAdmin
      .from('telemetry_events')
      .insert({
        component_id: app_id,
        severity: (body.severity && body.severity.toUpperCase()) || 'INFO',
        message: event_type,
        payload: body
      });
    if (telemetryError) console.error("Error inserting into telemetry_events:", telemetryError);

    const { error: nodeError } = await supabaseAdmin
      .from('ecosystem_nodes')
      .upsert({
          node_id: app_id,
          status: 'healthy',
          last_heartbeat: new Date().toISOString(),
          metadata: body.metrics || {}
      }, { onConflict: 'node_id' });

    if (nodeError) console.error("Error upserting into ecosystem_nodes:", nodeError);

    // Check if high severity and route to universal-dispatcher
    if ((body.severity && body.severity.toLowerCase() === 'critical') || event_type.includes('DDoS') || event_type.includes('RCA')) {
        try {
            const url = new URL(req.url);
            const dispatcherUrl = `${url.protocol}//${url.host}/universal-dispatcher`;
            await fetch(dispatcherUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Axim-Internal-Service-Key': Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
                },
                body: JSON.stringify({
                    action_type: 'ecosystem_incident_triage',
                    source: app_id,
                    payload: body.data || body
                })
            });
        } catch (dispatchError) {
            console.error("Failed to route to universal-dispatcher", dispatchError);
        }
    }

    if (provider || total_tokens || estimated_cost_usd) {
      const { error: usageError } = await supabaseAdmin
        .from('api_usage_logs')
        .insert({
          app_id: app_id,
          endpoint: 'satellite-telemetry',
          provider: provider,
          prompt_tokens: prompt_tokens,
          completion_tokens: completion_tokens,
          token_count: total_tokens,
          estimated_cost_usd: estimated_cost_usd,
          created_at: new Date().toISOString(),
        });
      if (usageError) console.error("Error inserting into api_usage_logs:", usageError);
    }

      } catch (err) {
        console.error("Satellite telemetry processing error:", err);
      }
    };

    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
      EdgeRuntime.waitUntil(processSatelliteTelemetry());
    } else {
      processSatelliteTelemetry();
    }

    return new Response(JSON.stringify({ success: true, edge_queued: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 202,
    });
  } catch (error) {
    console.error('Error in telemetry handler:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
