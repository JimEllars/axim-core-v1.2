import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // IMPORTANT: Replace with your app's URL in production
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Authenticate the user
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { integrationId, endpoint, method, body, headers } = await req.json();

    if (!integrationId) {
      return new Response(JSON.stringify({ error: 'integrationId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch the integration details, ensuring the user owns it.
    // PREREQUISITE: The 'api_integrations_ax2024' table MUST have a 'user_id' column
    // and RLS policies that restrict access to the owner.
    const { data: integration, error } = await supabaseClient
      .from('api_integrations_ax2024')
      .select('base_url, auth_type')
      .eq('id', integrationId)
      .eq('user_id', user.id) // This is the critical authorization check
      .single();

    if (error || !integration) {
      return new Response(JSON.stringify({ error: 'Integration not found or you do not have access.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Secrets must be stored as Supabase secrets, e.g., in the Vault.
    const apiKey = Deno.env.get(`API_KEY_${integrationId.replaceAll('-', '_')}`);

    if (!apiKey) {
        return new Response(JSON.stringify({ error: 'API key for integration not configured' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    const targetUrl = `${integration.base_url}${endpoint || ''}`;
    const requestHeaders = new Headers(headers || {});

    if (integration.auth_type === 'api_key_bearer') {
        requestHeaders.set('Authorization', `Bearer ${apiKey}`);
    } else if (integration.auth_type === 'basic_auth') {
        requestHeaders.set('Authorization', `Basic ${apiKey}`);
    }
    // Add other auth types as needed

    const response = await fetch(targetUrl, {
      method: method || 'GET',
      body: body ? JSON.stringify(body) : null,
      headers: requestHeaders,
    });

    const responseData = await response.json();

    return new Response(JSON.stringify({ status: response.status, data: responseData }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err?.message ?? String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});