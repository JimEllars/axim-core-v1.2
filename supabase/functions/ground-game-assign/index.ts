// supabase/functions/ground-game-assign/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.0.0';
import { corsHeaders } from '../_shared/cors.ts';

// Orchestration service for Ground Game (Political Context)
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('X-Axim-Internal-Service-Key');
    const expectedKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || 'test_internal_key';

    if (!authHeader || authHeader !== expectedKey) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { contactEmail, turfName, userId, actionType, messageContext } = await req.json();

    if (!contactEmail || !turfName || !userId) {
      throw new Error('Missing required parameters: contactEmail, turfName, and userId.');
    }

    console.log(`[Ground Game Orchestration] Received request to assign: ${contactEmail} to turf: ${turfName} from user: ${userId}`);

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') as string,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string
    );

    // 1. CRM Integration: Create or update targeted contact list
    console.log(`[Ground Game Orchestration] Syncing with CRM for turf: ${turfName}`);
    // Simulate CRM API call / Data insertion for targeted lists
    const assignmentId = `gg_assign_${Date.now()}`;
    const status = 'assigned';

    // 2. Queue localized email dispatches via send-email edge function
    if (actionType === 'mobilization') {
      console.log(`[Ground Game Orchestration] Triggering email dispatch via send-email for ${contactEmail}`);

      const emailPayload = {
        to: contactEmail,
        subject: `Mobilization Alert: Action needed in ${turfName}`,
        body: messageContext || `Please review the latest directives for your assigned turf: ${turfName}.`,
        user_id: userId
      };

      const { error: emailError } = await supabaseAdmin.functions.invoke('send-email', {
        body: emailPayload,
        headers: {
          'X-Axim-Internal-Service-Key': expectedKey
        }
      });

      if (emailError) {
        console.error(`[Ground Game Orchestration] Failed to dispatch email:`, emailError);
      } else {
        console.log(`[Ground Game Orchestration] Successfully queued email dispatch`);
      }
    }

    return new Response(
      JSON.stringify({ assignmentId, status, message: 'Ground Game action orchestrated successfully.' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('[Ground Game Orchestration] Fatal Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
