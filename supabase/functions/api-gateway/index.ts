import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { notifyOnyx } from '../_shared/telemetry.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') as string;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);



async function hashApiKey(apiKey: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(apiKey);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

serve(async (req) => {
  const endpoint = new URL(req.url).pathname;

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer axm_live_')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const token = authHeader.split(' ')[1];

    // Hash the token as we would store hashes (or if we store plain, we just query plain)
    // Actually, if we're cryptographically hashing to verify, let's just use the api_keys table
    // assuming it stores the raw key or a hash. The prompt says: "Cryptographically hash the key and query the api_keys table"
    const hashedKey = await hashApiKey(token);

    // 2. Query api_keys table
    // Prompt: "Cryptographically hash the key and query the api_keys table to ensure it is active"
    const { data: apiKeyData, error: keyError } = await supabaseAdmin
      .from('api_keys')
      .select('user_id')
      .eq('api_key', hashedKey)
      .single();

    if (keyError || !apiKeyData) {
      return new Response(JSON.stringify({ error: 'Invalid API Key' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const partnerId = apiKeyData.user_id;

    // 3. Query partner_credits table
    const { data: creditData, error: creditError } = await supabaseAdmin
      .from('partner_credits')
      .select('credits_remaining, id')
      .eq('partner_id', partnerId)
      .single();

    if (creditError || !creditData || creditData.credits_remaining <= 0) {
      await notifyOnyx(endpoint, 402, { partnerId, reason: 'Insufficient credits' });
      return new Response(JSON.stringify({ error: 'Payment Required' }), {
        status: 402,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 4. Decrement credit
    const { error: updateError } = await supabaseAdmin
      .from('partner_credits')
      .update({ credits_remaining: creditData.credits_remaining - 1 })
      .eq('id', creditData.id);

    if (updateError) {
      throw new Error('Failed to update credits');
    }

    // 5. Route payload / mock headless generator & Secure Artifact Storage
    const body = await req.json();
    const document_data = body.document_data || body;

    // Mock PDF generation
    const pdfContent = new TextEncoder().encode(`Mock PDF content for ${JSON.stringify(document_data)}`);
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

    // Generate signed URL (e.g. 15 minutes = 900 seconds)
    const { data: signedUrlData, error: urlError } = await supabaseAdmin.storage
      .from('secure_artifacts')
      .createSignedUrl(fileName, 900);

    if (urlError || !signedUrlData) {
      throw new Error('Failed to generate signed URL');
    }

    return new Response(JSON.stringify({
      success: true,
      download_url: signedUrlData.signedUrl
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('API Gateway Error:', error);
    await notifyOnyx(endpoint, 500, { error: error.message });
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
