import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.0.0';
import { corsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const origin = req.headers.get('origin');
    const headers = { ...corsHeaders, 'Content-Type': 'application/json' };

    const idempotencyKey = req.headers.get('Idempotency-Key');
    if (!idempotencyKey) {
      return new Response(JSON.stringify({ error: 'Missing Idempotency-Key header' }), { status: 400, headers });
    }

    const { name, email, phone, affiliate_program, intent } = await req.json();

    if (!name || !email) {
      return new Response(JSON.stringify({ error: 'Missing required fields: name, email' }), { status: 400, headers });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') as string,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string
    );

    // Check for idempotency using events_ax2024 (we can store the idempotency key in the event data or use a separate table, but contacts table upsert + idempotency check is needed)
    // Actually, checking if an event with this idempotency key exists already is a good way to handle idempotency.
    const { data: existingEvent, error: eventError } = await supabaseAdmin
      .from('events_ax2024')
      .select('id')
      .eq('type', 'NEW_AFFILIATE_LEAD')
      .contains('data', { idempotency_key: idempotencyKey })
      .maybeSingle();

    if (eventError) {
      throw eventError;
    }

    if (existingEvent) {
      return new Response(JSON.stringify({ message: 'Request already processed (idempotent)', status: 'skipped' }), { status: 200, headers });
    }

    // Upsert into contacts_ax2024
    const { data: contact, error: contactError } = await supabaseAdmin
      .from('contacts_ax2024')
      .upsert(
        { name, email, phone, source: 'affiliate-lead-ingest' },
        { onConflict: 'email' }
      )
      .select()
      .single();

    if (contactError) {
      throw contactError;
    }

    const leadData = {
      contact_id: contact.id,
      name,
      email,
      phone,
      affiliate_program,
      intent,
      idempotency_key: idempotencyKey
    };

    // Emit event
    const { error: insertEventError } = await supabaseAdmin
      .from('events_ax2024')
      .insert({
        type: 'NEW_AFFILIATE_LEAD',
        source: 'affiliate-lead-ingest',
        data: leadData
      });

    if (insertEventError) {
      throw insertEventError;
    }

    return new Response(JSON.stringify({ message: 'Lead ingested successfully', contact_id: contact.id }), { status: 200, headers });
  } catch (error: any) {
    console.error('Affiliate Lead Ingest Error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
});
