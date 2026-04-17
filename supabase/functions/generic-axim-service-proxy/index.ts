// supabase/functions/generic-axim-service-proxy/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders as CORS_HEADERS, getCorsHeaders } from '../_shared/cors.ts';

// A simple in-memory mapping of service names to their base URLs.
// In a real-world scenario, this could be stored in a Supabase table or environment variables.
const SERVICE_REGISTRY = {
  'transcription': 'https://api.axim.ai/transcribe', // Example URL
  'ground-game': 'https://api.axim.tech/ground-game', // Example URL
  'foreman-os': 'https://api.foremanos.com',      // Example URL
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req.headers.get('origin')) });
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

    // Here, you would implement secure service-to-service authentication.
    // This could involve forwarding a user JWT, using a service account, or a pre-shared key.
    const serviceToken = Deno.env.get('AXIM_INTERNAL_SERVICE_TOKEN');

    console.log(`[Service Proxy] Forwarding request for user ${userId} to ${targetUrl}`);

    // Forward the request to the target AXiM service.
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceToken}`,
        'X-User-ID': userId, // Forward the user's ID for context
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Request to ${serviceName} failed with status ${response.status}: ${errorBody}`);
    }

    const responseData = await response.json();

    return new Response(
      JSON.stringify(responseData),
      { headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[Service Proxy] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' } }
    );
  }
});
