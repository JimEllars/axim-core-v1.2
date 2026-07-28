import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const rawPayload = await req.json();
    const app_id = rawPayload.app_id || 'unknown_app';
    const traceId = req.headers.get('X-AXiM-Trace-ID') || rawPayload.metadata?.['X-AXiM-Trace-ID'] || 'no_trace_id';
    const authHeader = req.headers.get('Authorization') || '';
    const clientIp = req.headers.get('x-forwarded-for') || 'unknown_ip';

    // Import sanitization dynamically
    const { sanitizePayload } = await import('../telemetry-archiver/sanitization.ts');
    const sanitizedPayload = sanitizePayload(rawPayload);

    const oneMinuteAgo = new Date(Date.now() - 60000).toISOString()

    // Check request count for this specific IP within the last minute
    const { count, error: countError } = await supabaseClient
      .from('telemetry_logs')
      .select('*', { count: 'exact', head: true })
      .eq('app_type', app_id)
      .eq('ip_address', clientIp)
      .gte('timestamp', oneMinuteAgo)

    if (countError) throw countError

    if (count !== null && count >= 10) {
      // Log the violation in api_usage_logs
      await supabaseClient.from('api_usage_logs').insert({
        endpoint: '/telemetry-ingress',
        status_code: 429,
        // Using -1 to indicate an anomaly/violation
        compute_ms: -1
      })

      return new Response(
        JSON.stringify({ error: 'Too Many Requests' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 429 }
      )
    }

    // Insert the telemetry log
    const { error: insertError } = await supabaseClient.from('events_ax2024').insert({
        type: sanitizedPayload.event || 'generic_telemetry',
        source: app_id,
        data: sanitizedPayload.details || sanitizedPayload,
        created_at: new Date().toISOString()
    })

    if (insertError) throw insertError

    // Also log successful usage
    if (app_id === 'onyx_edge_worker') {
      await supabaseClient.from('api_usage_logs').insert({
          endpoint: rawPayload.endpoint || '/telemetry-ingress',
          status_code: rawPayload.status_code || 200,
          execution_time_ms: rawPayload.execution_time_ms || 0,
          compute_ms: rawPayload.compute_ms || 50,
          app_id: app_id,
          payload: {
              ...rawPayload.metadata,
              trace_id: traceId,
              auth_context: authHeader ? 'bearer_present' : 'none'
          }
      })
    } else {
      await supabaseClient.from('api_usage_logs').insert({
          endpoint: '/telemetry-ingress',
          status_code: 200,
          compute_ms: 50,
          payload: { trace_id: traceId, auth_context: authHeader ? 'bearer_present' : 'none' }
      })
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
