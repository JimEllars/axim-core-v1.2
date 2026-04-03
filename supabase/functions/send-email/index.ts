import { getCorsHeaders } from '../_shared/cors.ts';
// supabase/functions/send-email/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';



serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req.headers.get('Origin')) });
  }

  try {
    // 1. Initialize Supabase Client with Auth Context
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    // 2. Authenticate User
    const {
      data: { user },
    } = await supabaseClient.auth.getUser();

    if (!user) {
      throw new Error('Unauthorized: No active user session found.');
    }

    // 3. Parse and Validate Body
    const { to, subject, body } = await req.json();

    if (!to || !subject || !body) {
      throw new Error("Missing required fields: to, subject, body.");
    }

    console.log(`[Email Service] Authenticated User ${user.id} sending email to ${to}`);
    console.log(`[Email Service] Subject: ${subject}`);

    // --- Mock Email Sending Logic ---
    // In production, integration with Resend/SendGrid happens here.

    // For now, we simulate success.
    await new Promise(resolve => setTimeout(resolve, 500));

    return new Response(
      JSON.stringify({
        success: true,
        message: `Email successfully sent to ${to}`,
        id: `mock-email-${Date.now()}`
      }),
      { headers: { ...getCorsHeaders(req.headers.get('Origin')), 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Email Service] Error:', error);
    const status = error.message.includes('Unauthorized') ? 401 : 500;
    return new Response(
      JSON.stringify({ error: error.message }),
      { status, headers: { ...getCorsHeaders(req.headers.get('Origin')), 'Content-Type': 'application/json' } }
    );
  }
});
