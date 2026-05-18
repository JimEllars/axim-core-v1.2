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
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    const payload = await req.json();

    // Payload expected to come from database webhook on ecosystem_nodes update
    // e.g. record = { id, app_name, status, ... }
    if (payload && payload.record && payload.record.status === 'offline') {
        const diagnosticPayload = {
            message: `Node ${payload.record.app_name} (${payload.record.id}) is offline.`,
            node_id: payload.record.id,
            app_name: payload.record.app_name,
            timestamp: new Date().toISOString()
        };

        const { error: insertError } = await supabase
            .from('hitl_audit_logs')
            .insert([{
                action_type: 'SYSTEM_ALERT',
                status: 'pending',
                details: diagnosticPayload,
                user_id: null // System generated
            }]);

        if (insertError) {
             console.error("Failed to insert into hitl_audit_logs", insertError);
        }
    }

    return new Response(JSON.stringify({ success: true }), {
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
