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

    const { data: leads, error: fetchError } = await supabaseClient
      .from('customer_leads')
      .select('*')
      .eq('lead_status', 'Pending')
      .limit(5);

    if (fetchError) throw fetchError;

    for (const lead of leads || []) {
      const enrichedData = {
          id: lead.id,
          name: lead.meta?.name || "Enriched User",
          email: lead.meta?.email || "enriched@example.com",
          source: "autonomous-lead-scraper",
          status: "Enriched"
      };

      await supabaseClient
        .from('contacts')
        .upsert(enrichedData);

      await supabaseClient
        .from('customer_leads')
        .update({ lead_status: 'Enriched' })
        .eq('id', lead.id);

      await supabaseClient
        .from('api_usage_logs')
        .insert([{
            endpoint: '/autonomous-lead-scraper',
            status_code: 200,
            compute_ms: 100,
            app_id: 'axim-lead-scraper',
            timestamp: new Date().toISOString()
        }]);
    }

    return new Response(JSON.stringify({ success: true, processed: leads?.length || 0 }), {
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
