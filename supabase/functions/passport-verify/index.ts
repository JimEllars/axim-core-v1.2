import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';
import { generateAximSessionJwt } from '../_shared/auth.ts';
import { decode } from "https://deno.land/x/djwt@v2.8/mod.ts";
import { verify } from "https://deno.land/x/djwt@v2.8/mod.ts";
import { importPKCS8, importSPKI } from "https://deno.land/x/jose@v4.14.4/index.ts";
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

    if (!PASSPORT_JWT_SECRET) {
      console.error("PASSPORT_JWT_SECRET is not configured");
      return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
        status: 500,
        headers: { ...getCorsHeaders(req.headers.get("origin")), 'Content-Type': 'application/json' },
      });
    }

    // Verify cryptographic signature and expiration
    const secret = new TextEncoder().encode(PASSPORT_JWT_SECRET);

    let decodedToken;
    try {
        const { payload } = await jose.jwtVerify(token, secret, {
           // We might not have audience or issuer defined, just verify signature and exp
        });
        decodedToken = payload;
    } catch (e: any) {
        console.error("JWT Verification failed:", e.message);
        const errCode = e.code === 'ERR_JWT_EXPIRED' ? 'TOKEN_EXPIRED' : 'INVALID_SIGNATURE';
        return new Response(JSON.stringify({ error: 'Invalid or expired token', code: errCode }), {
            status: 401,
            headers: { ...getCorsHeaders(req.headers.get("origin")), 'Content-Type': 'application/json' },
        });
    }

    if (!decodedToken || typeof decodedToken !== 'object' || !decodedToken.sub) {
        return new Response(JSON.stringify({ error: 'Invalid token payload' }), {
            status: 401,
            headers: { ...getCorsHeaders(req.headers.get("origin")), 'Content-Type': 'application/json' },
        });
    }

    // Explicitly check expiration is within a 60-second window
    const now = Math.floor(Date.now() / 1000);
    // Let's assume the token was issued (iat) and expires (exp). We check if the difference is <= 60s
    // The instructions say "Confirm token expiration (exp) is strictly within the 60-second window."
    // Meaning it shouldn't be valid for more than 60 seconds from its issuance.
    if (decodedToken.exp && decodedToken.iat) {
        if (decodedToken.exp - decodedToken.iat > 60) {
            return new Response(JSON.stringify({ error: 'Token expiration window exceeds 60 seconds', code: 'INVALID_EXP_WINDOW' }), {
                status: 401,
                headers: { ...getCorsHeaders(req.headers.get("origin")), 'Content-Type': 'application/json' },
            });
        }
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
         console.error("Profile fetch error:", profileError);
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
         const role = passportProfile.role || 'retail';

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
    if (userProfile.user_roles && Array.isArray(userProfile.user_roles) && userProfile.user_roles.length > 0) {
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
