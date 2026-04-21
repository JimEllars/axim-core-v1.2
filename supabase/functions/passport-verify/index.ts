import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';
import { generateAximSessionJwt } from '../_shared/auth.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') as string;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req.headers.get('origin')) });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');

    // Verify the standard Supabase JWT token against the core users table
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' },
      });
    }

    // Fetch user engagement score (health index)
    const { data: scoreData, error: scoreError } = await supabaseAdmin
      .from('user_engagement_scores')
      .select('health_index')
      .eq('user_id', user.id)
      .single();

    if (scoreError && scoreError.code !== 'PGRST116') {
      console.error('Error fetching engagement score:', scoreError);
    }

    const healthIndex = scoreData ? scoreData.health_index : 100; // Default to 100 if no data

    const role = user.user_metadata?.role || 'user'; // fetch standard access level

    const aximSessionToken = await generateAximSessionJwt({
        sub: user.id,
        email: user.email,
        health_index: healthIndex,
        role: role
    });

    return new Response(JSON.stringify({
      user_id: user.id,
      email: user.email,
      health_index: healthIndex,
      role: role,
      verified: true,
      axim_session_token: aximSessionToken
    }), {
      status: 200,
      headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Passport Verify Error:', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' },
    });
  }
});
