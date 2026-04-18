import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.0.0';
import { corsHeaders, getCorsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req.headers.get('origin')) });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    const isServiceRole = authHeader === `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`;

    if (!isServiceRole) {
      const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: authHeader! } } }
      );

      const { data: { user }, error: userError } = await supabaseClient.auth.getUser();

      if (userError || !user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' },
        });
      }
    }

    const onyxEdgeUrl = Deno.env.get('ONYX_EDGE_URL');
    const onyxEdgeSecret = Deno.env.get('ONYX_EDGE_SECRET');

    if (!onyxEdgeUrl || !onyxEdgeSecret) {
      return new Response(JSON.stringify({ error: 'Onyx Edge configuration is missing on the server.' }), {
        status: 500,
        headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' },
      });
    }

    let bodyData = await req.json();

    // Onyx Recursive Intelligence (Audit Learning)
    // Join hitl_audit_logs to find the last 5 'Approve' actions
    const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    const { data: recentApprovals, error: auditError } = await supabaseAdmin
      .from('hitl_audit_logs')
      .select('*')
      .eq('action', 'Approve')
      .order('timestamp', { ascending: false })
      .limit(5);

    if (!auditError && recentApprovals && recentApprovals.length > 0) {
       // Inject as Historical Precedents into the context or prompt
       const precedents = recentApprovals.map(log => `Tool: ${log.tool_called}, Action: ${log.action}, Time: ${log.timestamp}`);
       if (!bodyData.context) bodyData.context = {};
       bodyData.context.historical_precedents = precedents;
    }

    const finalBody = JSON.stringify(bodyData);


    const onyxRequest = new Request(`https://${onyxEdgeUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${onyxEdgeSecret}`,
        // Pass through accept header if client wants text/event-stream
        'Accept': req.headers.get('Accept') || 'application/json'
      },
      body: finalBody
    });

    const onyxResponse = await fetch(onyxRequest);

    const responseHeaders = new Headers(onyxResponse.headers);
    const corsH = getCorsHeaders(req.headers.get('origin'));
    for (const [key, value] of Object.entries(corsH)) {
        responseHeaders.set(key, value);
    }

    return new Response(onyxResponse.body, {
      status: onyxResponse.status,
      headers: responseHeaders
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' },
    });
  }
});
