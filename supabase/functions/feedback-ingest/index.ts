import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.0.0';
import { getCorsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req.headers.get('origin')) });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();

    const body = await req.json();
    const { document_id, app_source, sentiment, comments } = body;

    if (!app_source || !sentiment) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: app_source, sentiment' }),
        { status: 400, headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' } }
      );
    }

    // Sanitize comments string slightly
    const sanitizedComments = comments ? comments.replace(/</g, "&lt;").replace(/>/g, "&gt;") : null;

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data, error } = await supabaseAdmin
      .from('product_feedback')
      .insert({
        user_id: user ? user.id : null,
        document_id: document_id || null,
        app_source: app_source,
        sentiment: sentiment,
        comments: sanitizedComments,
      });

    if (error) {
      throw error;
    }

    return new Response(JSON.stringify({ success: true, message: 'Feedback recorded' }), {
      status: 200,
      headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' },
    });
  }
});
