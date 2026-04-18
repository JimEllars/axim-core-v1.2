import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, getCorsHeaders } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') as string;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req.headers.get('origin')) });
  }

  try {
    const body = await req.json();

    // Only process INSERT events on auth.users (if configured this way via trigger)
    if (body.type === 'INSERT' && body.table === 'users' && body.schema === 'auth') {
       const userId = body.record.id;
       console.log(`Triggering New Partner Onboarding for user: ${userId}`);

       // Trigger the workflow using the AXiM Node backend or Edge Function logic
       // Normally we'd call the engine.js directly if in Node.js, but since Deno is isolated:
       // We log the event, and perhaps insert into an event table or call another service

       // Example logic for edge function
       const { error } = await supabaseAdmin.from('events_ax2024').insert({
          type: 'workflow_executed',
          data: { workflow: 'New Partner Onboarding', trigger: 'auth.users.INSERT' },
          user_id: userId
       });

       if (error) {
           console.error("Failed to log workflow execution trigger:", error);
       }

       // Insert a task or invoke another proxy if need be to do JS engine.js
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('Trigger Workflow Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
