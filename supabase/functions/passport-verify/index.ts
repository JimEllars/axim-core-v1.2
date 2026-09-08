import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';
import { generateAximSessionJwt } from '../_shared/auth.ts';
import * as jose from "https://deno.land/x/jose@v4.14.4/index.ts";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') as string;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string;
const PASSPORT_JWT_SECRET = Deno.env.get('PASSPORT_JWT_SECRET') as string;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req.headers.get("origin")) });
  }

  try {
    const rawBody = await req.json();
    const token = rawBody?.token;

    if (!token) {
      return new Response(JSON.stringify({ error: 'Missing token in body' }), {
        status: 401,
        headers: { ...getCorsHeaders(req.headers.get("origin")), 'Content-Type': 'application/json' },
      });
    }

    // Call external Passport API
    const verifyResponse = await fetch('https://passport.axim.us.com/api/v1/auth/verify-token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ token })
    });

    if (!verifyResponse.ok) {
        return new Response(JSON.stringify({ error: 'Invalid token from external Passport API' }), {
            status: 401,
            headers: { ...getCorsHeaders(req.headers.get("origin")), 'Content-Type': 'application/json' },
        });
    }

    const decodedToken = await verifyResponse.json();

    if (!decodedToken || typeof decodedToken !== 'object' || !decodedToken.sub) {
        return new Response(JSON.stringify({ error: 'Invalid token payload' }), {
            status: 401,
            headers: { ...getCorsHeaders(req.headers.get("origin")), 'Content-Type': 'application/json' },
        });
    }

    // Query `public.users` / `public.user_roles`
    const { data: userProfile, error: profileError } = await supabaseAdmin
        .from('users')
        .select(`
            id,
            email,
            tenant_id,
            user_roles (
                role
            )
        `)
        .eq('id', decodedToken.sub)
        .single();

    if (profileError || !userProfile) {
         // Fallback to checking axim_passports if users table is not the target
         const { data: passportProfile, error: passportError } = await supabaseAdmin
             .from('axim_passports')
             .select('*')
             .eq('id', decodedToken.sub)
             .single();

         if (passportError || !passportProfile) {
             return new Response(JSON.stringify({ error: 'User profile not found' }), {
                 status: 401,
                 headers: { ...getCorsHeaders(req.headers.get("origin")), 'Content-Type': 'application/json' },
             });
         }

         // Hydrate from passport
         const { data: scoreData } = await supabaseAdmin
           .from('user_engagement_scores')
           .select('health_index')
           .eq('user_id', passportProfile.id)
           .single();

         const healthIndex = scoreData ? scoreData.health_index : 100;
         let role = passportProfile.role || 'retail';

         if (decodedToken.email === 'james.ellars@axim.us.com' || decodedToken.email === 'jrellars@gmail.com') {
             role = 'super_user';
         }

         const aximSessionToken = await generateAximSessionJwt({
             sub: passportProfile.id,
             email: decodedToken.email || passportProfile.wallet_address,
             health_index: healthIndex,
             role: role,
             wallet_address: passportProfile.wallet_address || null
         });

         return new Response(JSON.stringify({
             user_id: passportProfile.id,
             tenant_id: null,
             role: role,
             verified: true,
             axim_session_token: aximSessionToken
         }), {
             status: 200,
             headers: { ...getCorsHeaders(req.headers.get("origin")), 'Content-Type': 'application/json' },
         });
    }

    // We found a profile in users table
    const { data: scoreData } = await supabaseAdmin
      .from('user_engagement_scores')
      .select('health_index')
      .eq('user_id', userProfile.id)
      .single();

    const healthIndex = scoreData ? scoreData.health_index : 100;

    // Extract role
    let role = 'user';
    if (userProfile.email === 'james.ellars@axim.us.com' || userProfile.email === 'jrellars@gmail.com') {
        role = 'super_user';
    } else if (userProfile.user_roles && Array.isArray(userProfile.user_roles) && userProfile.user_roles.length > 0) {
        role = userProfile.user_roles[0].role;
    } else if (userProfile.user_roles && typeof userProfile.user_roles === 'object') {
        role = (userProfile.user_roles as any).role || 'user';
    }

    const aximSessionToken = await generateAximSessionJwt({
        sub: userProfile.id,
        email: userProfile.email,
        health_index: healthIndex,
        role: role,
        wallet_address: decodedToken.wallet_address || null
    });

    return new Response(JSON.stringify({
      user_id: userProfile.id,
      email: userProfile.email,
      tenant_id: userProfile.tenant_id,
      health_index: healthIndex,
      role: role,
      verified: true,
      axim_session_token: aximSessionToken
    }), {
      status: 200,
      headers: { ...getCorsHeaders(req.headers.get("origin")), 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Passport Verify Error:', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { ...getCorsHeaders(req.headers.get("origin")), 'Content-Type': 'application/json' },
    });
  }
});
