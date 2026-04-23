import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, getCorsHeaders } from '../_shared/cors.ts';
import { notifyOnyx } from '../_shared/telemetry.ts';
declare const EdgeRuntime: any;
import { generatePdf } from '../_shared/pdf-generators/index.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') as string;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string;
const INTERNAL_SERVICE_KEY = Deno.env.get('AXIM_INTERNAL_SERVICE_KEY') as string || 'fallback_internal_key'; // Default if not set

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const ALLOWED_ORIGINS = [
  'https://quickdemandletter.com',
  'https://your-nda-domain.com'
];

serve(async (req) => {
  const startTime = Date.now();
  const endpoint = new URL(req.url).pathname;

  const origin = req.headers.get('origin');
  let corsOrigin = ALLOWED_ORIGINS.includes(origin || '') ? origin : ALLOWED_ORIGINS[0];

  const securityHeaders = {
    'Access-Control-Allow-Origin': corsOrigin || '',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, X-Axim-Internal-Service-Key',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: securityHeaders });
  }

  // Bot-Defense middleware: Reject requests lacking a standard User-Agent
  const userAgent = req.headers.get('user-agent');
  if (!userAgent || userAgent.trim() === '') {
    return new Response(JSON.stringify({ error: 'Forbidden: Invalid User-Agent' }), {
      status: 403,
      headers: { ...securityHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const internalKeyHeader = req.headers.get('X-Axim-Internal-Service-Key');

    if (!internalKeyHeader || internalKeyHeader !== INTERNAL_SERVICE_KEY) {
      await notifyOnyx(endpoint, 403, { reason: 'Invalid internal service key attempt' });
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...securityHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (req.method === 'POST' && endpoint === '/api/v1/telemetry/ingest') {
      let body;
      try {
        body = await req.json();
      } catch (e) {
        body = {};
      }

      EdgeRuntime.waitUntil(
        supabaseAdmin.from('telemetry_logs').insert({
          session_id: body.session_id,
          event: body.event,
          app_type: body.app_type,
          timestamp: body.timestamp || new Date().toISOString(),
          details: body.details || {}
        })
      );

      return new Response(JSON.stringify({ success: true, message: 'Telemetry event accepted' }), {
        status: 202,
        headers: { ...securityHeaders, 'Content-Type': 'application/json' }
      });
    }

    let body;
    try {
        body = await req.json();
    } catch (e) {
        body = {};
    }

    const document_data = body.document_data || body;
    const finalAppSource = body.app_source || 'AXiM Internal Workflow';

    // Generate real PDF content using shared pdf generator
    const pdfContent = await generatePdf(finalAppSource, document_data);
    const fileName = `generated_document_${Date.now()}.pdf`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from('secure_artifacts')
      .upload(fileName, pdfContent, {
        contentType: 'application/pdf',
        upsert: false
      });

    if (uploadError) {
      throw new Error(`Failed to store artifact: ${uploadError.message}`);
    }

    const { data: signedUrlData, error: urlError } = await supabaseAdmin.storage
      .from('secure_artifacts')
      .createSignedUrl(fileName, 900);

    if (urlError || !signedUrlData) {
      throw new Error('Failed to generate signed URL');
    }

    const response = new Response(JSON.stringify({
      success: true,
      download_url: signedUrlData.signedUrl
    }), {
      status: 200,
      headers: { ...securityHeaders, 'Content-Type': 'application/json' }
    });

    return response;

  } catch (error: any) {
    console.error('API Gateway Error:', error);
    await notifyOnyx(endpoint, 500, { error: error.message });
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { ...securityHeaders, 'Content-Type': 'application/json' }
    });
  }
});
