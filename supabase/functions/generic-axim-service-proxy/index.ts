// supabase/functions/generic-axim-service-proxy/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders as CORS_HEADERS, corsHeaders } from '../_shared/cors.ts';
import { logTelemetry } from '../_shared/telemetry.ts';

// A simple in-memory mapping of service names to their base URLs.
// In a real-world scenario, this could be stored in a Supabase table or environment variables.
const SERVICE_REGISTRY = {
  'transcription': 'https://api.axim.ai/transcribe', // Example URL
  'ground-game': 'https://api.axim.tech/ground-game', // Example URL
  'foreman-os': 'https://api.foremanos.com',      // Example URL
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { serviceName, endpoint, payload, userId } = await req.json();

    if (!serviceName || !endpoint || !payload || !userId) {
      throw new Error('Missing required parameters: serviceName, endpoint, payload, userId.');
    }


    const baseUrl = SERVICE_REGISTRY[serviceName];
    if (!baseUrl) {
      throw new Error(`Service "${serviceName}" is not registered.`);
    }

    const targetUrl = `${baseUrl}/${endpoint}`;

    // Fetch zero-trust bearer token from the ecosystem vault securely
    const supabaseUrl = Deno.env.get('SUPABASE_URL') as string;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string;

    // We use standard fetch here to emulate service role query if createClient is an issue or just use createClient
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: vaultData, error: vaultError } = await supabaseAdmin
        .from('ecosystem_vault')
        .select('api_key')
        .eq('service_name', serviceName)
        .single();

    if (vaultError || !vaultData) {
        console.warn(`[Service Proxy] Key for ${serviceName} not found in ecosystem_vault. Falling back to internal token.`);
    }

    // Inject secure token from vault if available, otherwise fallback
    const serviceToken = vaultData?.api_key || Deno.env.get('AXIM_INTERNAL_SERVICE_TOKEN');

    console.log(`[Service Proxy] Forwarding request for user ${userId} to ${targetUrl}`);


    // Forward the request to the target AXiM service.
    const fetchPromise = fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceToken}`,
        'X-User-ID': userId, // Forward the user's ID for context
      },
      body: JSON.stringify(payload),
    });

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Integration timeout')), 5000);
    });

    let response;
    try {
      response = await Promise.race([fetchPromise, timeoutPromise]);
    } catch (err) {
      if (err.message === 'Integration timeout') {
        await logTelemetry(
          'generic-axim-service-proxy',
          504,
          { action: 'integration_timeout', targetUrl, serviceName },
          'WARNING'
        );
        return new Response(
          JSON.stringify({ error: 'Gateway Timeout: The upstream service did not respond in time.' }),
          { status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw err;
    }

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Request to ${serviceName} failed with status ${response.status}: ${errorBody}`);
    }

    const responseData = await response.json();

    return new Response(
      JSON.stringify(responseData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[Service Proxy] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
