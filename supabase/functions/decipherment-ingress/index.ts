import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, X-Axim-Gateway-Token',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const gatewayToken = req.headers.get('X-Axim-Gateway-Token');
    if (gatewayToken !== Deno.env.get('AXIM_GATEWAY_TOKEN')) {
      return new Response(JSON.stringify({ error: 'Unauthorized gateway token' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const payload = await req.json();

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data, error } = await supabaseClient
      .from('decipherment_volumes')
      .insert({
        scan_name: payload.scan_name,
        beamline_source: payload.beamline_source,
        energy_kev: payload.energy_kev,
        voxel_size_microns: payload.voxel_size_microns,
        dimensions: payload.dimensions,
        storage_uri: payload.storage_uri,
        metadata: payload.metadata
      })
      .select('id')
      .single();

    if (error) throw error;

    return new Response(
      JSON.stringify({ status: "success", volume_id: data.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});
