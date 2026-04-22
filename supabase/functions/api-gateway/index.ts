import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, getCorsHeaders } from '../_shared/cors.ts';
import { notifyOnyx } from '../_shared/telemetry.ts';
import { generatePdf } from '../_shared/pdf-generators/index.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') as string;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Edge Cache implementation
interface CacheEntry {
    apiKeyData: any;
    timestamp: number;
}
const CACHE_TTL_MS = 60000; // 60 seconds
const apiCache = new Map<string, CacheEntry>();

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
    return new Response('ok', { headers: getCorsHeaders(req.headers.get('origin')) });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer axm_live_')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' }
      });
    }

    const token = authHeader.split(' ')[1];
    const hashedKey = await hashApiKey(token);

    let apiKeyData = null;
    const cached = apiCache.get(hashedKey);

    if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
        apiKeyData = cached.apiKeyData;
    } else {
        const { data, error: keyError } = await supabaseAdmin
          .from('api_keys')
          .select('id, user_id, api_key, tier, rate_limit')
          .eq('api_key', hashedKey)
          .single();

        if (keyError || !data) {
          return new Response(JSON.stringify({ error: 'Invalid API Key' }), {
            status: 401,
            headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' }
          });
        }

        apiKeyData = data;
        apiCache.set(hashedKey, { apiKeyData, timestamp: Date.now() });
    }

    // We clone the request before parsing JSON to get app_source if possible
    let clonedReq = req.clone();
    let body;
    try {
        body = await clonedReq.json();
    } catch (e) {
        body = {};
    }
    const appSource = body?.app_source || 'AXiM API Gateway Document';

    // Ecosystem Circuit Breaker Check
    const { data: appData, error: appError } = await supabaseAdmin
      .from('ecosystem_apps')
      .select('is_active')
      .eq('app_id', appSource)
      .single();

    // If app exists and is_active is false, quarantine it
    if (!appError && appData && appData.is_active === false) {
      return new Response(JSON.stringify({ error: 'App Quarantined by AXiM Swarm' }), {
        status: 503,
        headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' }
      });
    }

    const partnerId = apiKeyData.user_id;

    // Dynamic Rate Limiting
    let rateLimitCap = apiKeyData.rate_limit || 100; // Requests per minute

    // Check if user is an AXiM node holder
    try {
        const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(partnerId);

        if (!userError && userData && userData.user && userData.user.user_metadata) {
            if (userData.user.user_metadata.axim_node_holder) {
                rateLimitCap = Math.max(rateLimitCap, 1000);
            }
        }
    } catch (e) {
        console.warn("Failed to check Web3 token identity, defaulting to standard rate limit", e);
    }

    // Call our rate limiting RPC to enforce quota. Let's assume an RPC exists `enforce_rate_limit`
    // Alternatively, if we don't have an RPC, we will manage usage counters in DB
    const { data: rateLimitData, error: rlError } = await supabaseAdmin
      .rpc('increment_api_usage', { p_api_key_id: apiKeyData.id, p_limit: rateLimitCap });

    // Assuming increment_api_usage returns true if allowed, false if limit exceeded.
    // Let's implement a fallback simple tracking if RPC isn't guaranteed or we need something basic
    // Instead of failing due to RPC missing, we'll try to insert a log and check counts.
    const minuteAgo = new Date(Date.now() - 60000).toISOString();
    const { count: currentUsage, error: countError } = await supabaseAdmin
        .from('api_usage_logs')
        .select('*', { count: 'exact', head: true })
        .eq('api_key_id', apiKeyData.id)
        .gte('created_at', minuteAgo);

    if (currentUsage !== null && currentUsage >= rateLimitCap) {
      await notifyOnyx(endpoint, 429, { partnerId, reason: 'Rate limit exceeded' });
      return new Response(JSON.stringify({ error: 'Too Many Requests' }), {
        status: 429,
        headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' }
      });
    }

    // Log the usage
    await supabaseAdmin.from('api_usage_logs').insert({
      api_key_id: apiKeyData.id,
      partner_id: partnerId,
      endpoint: endpoint
    });

    const { data: creditData, error: creditError } = await supabaseAdmin
      .from('partner_credits')
      .select('credits_remaining, id')
      .eq('partner_id', partnerId)
      .single();

    if (creditError || !creditData || creditData.credits_remaining <= 0) {
      await notifyOnyx(endpoint, 402, { partnerId, reason: 'Insufficient credits' });
      return new Response(JSON.stringify({ error: 'Payment Required' }), {
        status: 402,
        headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' }
      });
    }

    const { error: updateError } = await supabaseAdmin
      .from('partner_credits')
      .update({ credits_remaining: creditData.credits_remaining - 1 })
      .eq('id', creditData.id);

    if (updateError) {
      throw new Error('Failed to update credits');
    }

    const finalBody = await req.json();
    const document_data = finalBody.document_data || finalBody;
    const finalAppSource = finalBody.app_source || 'AXiM API Gateway Document';

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

    return new Response(JSON.stringify({
      success: true,
      download_url: signedUrlData.signedUrl
    }), {
      status: 200,
      headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('API Gateway Error:', error);
    await notifyOnyx(endpoint, 500, { error: error.message });
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' }
    });
  }
});
