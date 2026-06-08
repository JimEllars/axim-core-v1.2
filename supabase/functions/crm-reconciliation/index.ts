import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const payload = await req.json()
    const { lead_id, deskera_contact_id } = payload

    if (!lead_id || !deskera_contact_id) {
      return new Response(
        JSON.stringify({ error: 'Missing lead_id or deskera_contact_id' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // First fetch the existing record to get the payload
    const { data: leadData, error: fetchError } = await supabaseClient
      .from('customer_leads')
      .select('encrypted_payload')
      .eq('id', lead_id)
      .single()

    if (fetchError) throw fetchError

    // We append the external CRM ID to the payload or metadata
    const updatedPayload = {
      ...(leadData?.encrypted_payload || {}),
      external_crm_id: deskera_contact_id
    }

    // Update customer_leads with Synced status
    const { data, error } = await supabaseClient
      .from('customer_leads')
      .update({
        lead_status: 'Synced',
        encrypted_payload: updatedPayload
      })
      .eq('id', lead_id)
      .select()

    if (error) throw error

    return new Response(
      JSON.stringify({ success: true, message: 'CRM reconciliation successful' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
