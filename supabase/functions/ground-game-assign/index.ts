// supabase/functions/ground-game-assign/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// This is a mock service for the Ground Game canvassing app.
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const { contactEmail, turfName, userId } = await req.json();

    if (!contactEmail || !turfName || !userId) {
      throw new Error('Missing required parameters: contactEmail, turfName, and userId.');
    }

    // Simulate an API call to the Ground Game service.
    console.log(`[Ground Game Service] Received request to assign: ${contactEmail} to turf: ${turfName} from user: ${userId}`);

    // Generate a unique ID for the assignment.
    const assignmentId = `gg_assign_${Date.now()}`;
    const status = 'assigned';

    // Simulate storing the assignment in a database.
    console.log(`[Ground Game Service] Assignment created with ID: ${assignmentId}`);

    return new Response(
      JSON.stringify({ assignmentId, status }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
});
