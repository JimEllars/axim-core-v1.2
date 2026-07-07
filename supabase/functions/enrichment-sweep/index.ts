import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Scan for contacts exceeding 90 days lacking critical firmographic parameters
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const { data: contacts, error } = await supabaseClient
      .from('contacts_ax2024')
      .select('id, name, email')
      .lt('created_at', ninetyDaysAgo.toISOString())
      .or('facility_zip.is.null,axim_lead_score.is.null')
      .limit(100);

    if (error) throw error;

    if (!contacts || contacts.length === 0) {
      return new Response(JSON.stringify({ message: "No stale contacts found for enrichment." }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    console.log(`Found ${contacts.length} stale contacts to re-queue for enrichment.`);

    // Active secure communication call targeting the central data plane via postgrest headers
    const dataPlaneUrl = Deno.env.get("AXIM_CORE_REST_URL") || Deno.env.get("SUPABASE_URL") + "/rest/v1";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";

    const payload = contacts.map(c => ({
       email: c.email,
       lead_status: 'Pending_Review', // Re-queue into the enrichment stream automatically
       source: 'enrichment-sweep'
    }));

    const response = await fetch(`${dataPlaneUrl}/customer_leads`, {
        method: "POST",
        headers: {
           "Content-Type": "application/json",
           "Prefer": "resolution=merge-duplicates",
           "Authorization": `Bearer ${anonKey}`,
           "apikey": anonKey
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        throw new Error('Data plane ingress failed for enrichment sweep');
    }

    return new Response(JSON.stringify({ message: `Successfully queued ${contacts.length} contacts for enrichment.` }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('Enrichment Sweep Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
