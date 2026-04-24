import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') as string;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string;
const INTERNAL_SERVICE_KEY = Deno.env.get('AXIM_INTERNAL_SERVICE_KEY') as string || 'fallback_internal_key';

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const internalKeyHeader = req.headers.get('X-Axim-Internal-Service-Key');
    if (!internalKeyHeader || internalKeyHeader !== INTERNAL_SERVICE_KEY) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const body = await req.json();
    const { target_service, action_type, payload } = body;

    if (!target_service || !action_type || !payload) {
        return new Response(JSON.stringify({ error: 'Missing required fields: target_service, action_type, or payload' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    // 1. Query ecosystem_connections for the target_service
    const { data: connection, error: connectionError } = await supabaseAdmin
        .from('ecosystem_connections')
        .select('webhook_url, api_key, status')
        .eq('service_name', target_service.toLowerCase())
        .single();

    if (connectionError || !connection) {
        throw new Error(`Integration not found or inactive for service: ${target_service}`);
    }

    if (connection.status !== 'active') {
        throw new Error(`Integration is currently disabled for service: ${target_service}`);
    }

    // 2. Prepare and send the payload securely
    const targetUrl = connection.webhook_url;
    const headers: Record<string, string> = {
        'Content-Type': 'application/json'
    };

    if (connection.api_key) {
        headers['Authorization'] = `Bearer ${connection.api_key}`;
    }

    const response = await fetch(targetUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            action_type,
            payload,
            timestamp: new Date().toISOString()
        })
    });

    // 3. Log to telemetry on 500 errors
    if (!response.ok) {
        const responseText = await response.text();
        const statusCode = response.status;

        if (statusCode >= 500) {
            await supabaseAdmin.from('telemetry_logs').insert({
                event: 'integration_failure',
                app_type: 'universal-dispatcher',
                status_code: statusCode,
                timestamp: new Date().toISOString(),
                details: {
                    target_service,
                    action_type,
                    error: responseText
                }
            });
        }

        return new Response(JSON.stringify({ error: `Downstream service returned ${statusCode}`, details: responseText }), {
            status: 502,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    // Success response
    const downstreamResult = await response.text();

    // Update last_triggered time
    await supabaseAdmin
        .from('ecosystem_connections')
        .update({ last_triggered: new Date().toISOString() })
        .eq('service_name', target_service.toLowerCase());

    return new Response(JSON.stringify({ success: true, target_service, action_type, downstreamResponse: downstreamResult }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Universal Dispatcher Error:', error);

    // Log unexpected errors as integration_failures as well
    await supabaseAdmin.from('telemetry_logs').insert({
        event: 'integration_failure',
        app_type: 'universal-dispatcher',
        status_code: 500,
        timestamp: new Date().toISOString(),
        details: {
            error: error.message
        }
    });

    return new Response(JSON.stringify({ error: 'Internal Server Error', message: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
