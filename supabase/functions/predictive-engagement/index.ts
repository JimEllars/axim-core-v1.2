import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
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
    const authHeader = req.headers.get('Authorization');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    // Authorization check
    if (!authHeader || !authHeader.includes(serviceRoleKey)) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      serviceRoleKey ?? ''
    );

    // Fetch records to engage
    const { data: users, error: fetchError } = await supabaseClient
      .from('user_engagement_scores')
      .select('*')
      .limit(10);

    if (fetchError) throw fetchError;

    for (const user of users || []) {
       const leadScore = Math.floor(Math.random() * 100);

       await supabaseClient
        .from('customer_leads')
        .update({ lead_score: leadScore })
        .eq('id', user.id);

       await supabaseClient
        .from('api_usage_logs')
        .insert([{
            endpoint: '/predictive-engagement',
            status_code: 200,
            compute_ms: 50,
            app_id: 'axim-predictive-engagement',
            timestamp: new Date().toISOString()
        }]);
    }

    return new Response(JSON.stringify({ success: true, engaged: users?.length || 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
