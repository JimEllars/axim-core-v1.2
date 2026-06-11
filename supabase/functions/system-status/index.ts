import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const authHeader = req.headers.get('Authorization') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    // Create authenticated client for tenant scoping via RLS
    const supabase = createClient(supabaseUrl, anonKey, {
       global: { headers: { Authorization: authHeader } }
    });

    const [nodesRes, appsRes] = await Promise.all([
      supabase.from('ecosystem_nodes').select('id, app_name, status, last_ping, updated_at'),
      supabase.from('ecosystem_apps').select('app_id, status, is_active')
    ]);

    if (nodesRes.error) throw nodesRes.error;
    if (appsRes.error) throw appsRes.error;

    const summary = {
      nodes: nodesRes.data || [],
      apps: appsRes.data || [],
      timestamp: new Date().toISOString()
    };

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
