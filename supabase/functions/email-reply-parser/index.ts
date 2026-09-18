import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const senderEmail = body.sender_email || body.from;

    if (!senderEmail) {
       return new Response(JSON.stringify({ error: 'Missing sender email' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
       });
    }

    const { data: leads, error: leadError } = await supabaseAdmin
      .from('nexus_leads')
      .select('id')
      .eq('email', senderEmail);

    if (leadError) {
      throw leadError;
    }

    if (!leads || leads.length === 0) {
      return new Response(JSON.stringify({ message: 'Sender not recognized. No action taken.' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    for (const lead of leads) {
        const { error: updateError } = await supabaseAdmin
          .from('crm_sequence_enrollments')
          .update({ status: 'paused' })
          .eq('lead_id', lead.id)
          .eq('status', 'active');

        if (updateError) {
            console.error(`Error updating sequences for lead ${lead.id}:`, updateError);
            continue;
        }

        const { error: logError } = await supabaseAdmin
          .from('api_usage_logs')
          .insert({
            action: 'automated_sequence_paused',
            payload: { lead_id: lead.id, sender_email: senderEmail }
          });

        if (logError) {
             console.error(`Error logging action for lead ${lead.id}:`, logError);
        }
    }

    return new Response(JSON.stringify({ success: true, message: 'Automated sequence paused' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Email Reply Parser Error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Internal Server Error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
