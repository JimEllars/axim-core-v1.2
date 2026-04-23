import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, getCorsHeaders } from '../_shared/cors.ts';
import { notifyOnyx } from '../_shared/telemetry.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') as string;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string;
const INTERNAL_SERVICE_KEY = Deno.env.get('AXIM_INTERNAL_SERVICE_KEY') as string || 'fallback_internal_key'; // Default if not set

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(async (req) => {
  const endpoint = new URL(req.url).pathname;

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req.headers.get('origin')) });
  }

  try {
    const internalKeyHeader = req.headers.get('X-Axim-Internal-Service-Key');

    if (!internalKeyHeader || internalKeyHeader !== INTERNAL_SERVICE_KEY) {
      await notifyOnyx(endpoint, 403, { reason: 'Invalid internal service key attempt' });
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' }
      });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File;
    const documentType = formData.get('document_type') as string || 'unknown';
    const traceId = formData.get('trace_id') as string || 'unknown';

    if (!file) {
      return new Response(JSON.stringify({ error: 'No file uploaded' }), {
        status: 400,
        headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' }
      });
    }

    const fileExt = file.name.split('.').pop();
    const fileName = `${documentType}_${Date.now()}_${traceId}.${fileExt}`;
    const arrayBuffer = await file.arrayBuffer();
    const pdfContent = new Uint8Array(arrayBuffer);

    const { error: uploadError } = await supabaseAdmin.storage
      .from('secure_artifacts')
      .upload(fileName, pdfContent, {
        contentType: file.type || 'application/pdf',
        upsert: false
      });

    if (uploadError) {
      throw new Error(`Failed to store artifact: ${uploadError.message}`);
    }

    const { error: dbError } = await supabaseAdmin
      .from('vault_records')
      .insert({
        file_name: fileName,
        document_type: documentType,
        trace_id: traceId,
        bucket_id: 'secure_artifacts'
      });

    if (dbError) {
      // Don't fail completely if just db insert fails, we already have the file
      console.error('Failed to insert vault record:', dbError);
    }

    return new Response(JSON.stringify({ success: true, file_name: fileName }), {
      status: 200,
      headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Vault Upload Error:', error);
    await notifyOnyx(endpoint, 500, { error: error.message });
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' }
    });
  }
});
