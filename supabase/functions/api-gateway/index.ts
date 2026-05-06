import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { generatePdf } from '../_shared/pdf-generators/index.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') as string;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string;
const INTERNAL_SERVICE_KEY = Deno.env.get('AXIM_INTERNAL_SERVICE_KEY') as string || 'fallback_internal_key'; // Default if not set

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Rate Limiter
const rateLimitMap = new Map<string, { count: number, resetTime: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS = 100;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (!record) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (now > record.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (record.count >= MAX_REQUESTS) {
    return false;
  }

  record.count++;
  return true;
}

// Payload depth checker
function getDepth(obj: any): number {
  if (obj && typeof obj === 'object') {
    let depth = 0;
    for (const key in obj) {
      depth = Math.max(depth, getDepth(obj[key]));
    }
    return depth + 1;
  }
  return 0;
}

async function notifyOnyx(endpoint: string, status: number, details: any) {
    // Dummy notify function
    console.error(`Onyx Alert: ${status} on ${endpoint}`, details);
}

const ALLOWED_ORIGINS = [
  'https://quickdemandletter.com',
  'https://your-nda-domain.com'
];

serve(async (req) => {

  async function logSecurityAnomaly(reason: string, details: any = {}) {
    const ip = req.headers.get('CF-Connecting-IP') || req.headers.get('x-forwarded-for') || 'unknown';
    console.warn(`Security Anomaly: ${reason} from IP: ${ip}`);
    if (typeof EdgeRuntime !== 'undefined') {
      EdgeRuntime.waitUntil(
        supabaseAdmin.from('telemetry_logs').insert({
          event: 'security_anomaly',
          app_type: 'api-gateway',
          severity: 'HIGH',
          timestamp: new Date().toISOString(),
          ip_address: ip,
          endpoint: endpoint,
          details: { reason, ...details }
        })
      );
    }
  }

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
    await logSecurityAnomaly('Forbidden: Invalid User-Agent');
    return new Response(JSON.stringify({ error: 'Forbidden: Invalid User-Agent' }), {
      status: 403,
      headers: { ...securityHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const ip = req.headers.get('CF-Connecting-IP') || req.headers.get('x-forwarded-for') || 'unknown';
    const internalKeyHeader = req.headers.get('X-Axim-Internal-Service-Key');
    const authHeader = req.headers.get('Authorization');
    const isInternal = internalKeyHeader === INTERNAL_SERVICE_KEY;

    let partnerId: string | null = null;
    let apiKeyId: string | null = null;

    if (!isInternal && ip !== 'unknown') {
      if (!checkRateLimit(ip)) {
        await logSecurityAnomaly('Rate Limit Exceeded', { limit: MAX_REQUESTS, window: RATE_LIMIT_WINDOW });
        return new Response(JSON.stringify({ error: 'Too Many Requests' }), {
          status: 429,
          headers: { ...securityHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    if (!isInternal) {
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        await logSecurityAnomaly('Unauthorized: Missing or invalid Authorization header');
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...securityHeaders, 'Content-Type': 'application/json' }
        });
      }

      const apiKey = authHeader.split(' ')[1];

      // Validate the key against the api_keys table
      const { data: apiKeyData, error: apiKeyError } = await supabaseAdmin
        .from('api_keys')
        .select('id, user_id, service')
        .eq('api_key', apiKey)
        .single();

      if (apiKeyError || !apiKeyData) {
        await logSecurityAnomaly('Unauthorized: Invalid API Key');
        return new Response(JSON.stringify({ error: 'Unauthorized: Invalid API Key' }), {
          status: 401,
          headers: { ...securityHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Ensure the associated ecosystem_app is online
      const { data: appData, error: appError } = await supabaseAdmin
        .from('ecosystem_apps')
        .select('is_active, status')
        .eq('app_id', apiKeyData.service)
        .single();

      if (appError || !appData || !appData.is_active || appData.status !== 'online') {
        await logSecurityAnomaly(`Forbidden: Ecosystem app '${apiKeyData.service}' is offline or inactive`);
        return new Response(JSON.stringify({ error: 'Forbidden: App is offline or inactive' }), {
          status: 403,
          headers: { ...securityHeaders, 'Content-Type': 'application/json' }
        });
      }

      partnerId = apiKeyData.user_id;
      apiKeyId = apiKeyData.id;

      // Log the request to api_usage_logs
      if (typeof EdgeRuntime !== 'undefined') {
        EdgeRuntime.waitUntil(
          supabaseAdmin.from('api_usage_logs').insert({
            api_key_id: apiKeyId,
            partner_id: partnerId,
            endpoint: endpoint,
            created_at: new Date().toISOString()
          })
        );
      }
    }

    if (req.method === 'POST') {
      const clone = req.clone();
      const text = await clone.text();

      if (text.length > 5 * 1024 * 1024) {
        await logSecurityAnomaly('Payload Too Large', { size: text.length });
        return new Response(JSON.stringify({ error: 'Payload Too Large' }), {
          status: 413,
          headers: { ...securityHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
        try {
          const parsed = JSON.parse(text);
          if (getDepth(parsed) > 10) {
            await logSecurityAnomaly('Payload Too Nested', { depth: getDepth(parsed) });
            return new Response(JSON.stringify({ error: 'Payload Too Large (Too nested)' }), {
              status: 413,
              headers: { ...securityHeaders, 'Content-Type': 'application/json' }
            });
          }
        } catch (e) {
          // ignore parse error
        }
      }
    }

    let body;
    try {
        body = await req.json();
    } catch (e) {
        body = {};
    }

    if (!isInternal && endpoint === '/api/v1/dispatch') {
      const dispatcherUrl = `${SUPABASE_URL}/functions/v1/universal-dispatcher`;
      const dispatchRes = await fetch(dispatcherUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
        },
        body: JSON.stringify({ ...body, partner_id: partnerId, api_key_id: apiKeyId })
      });

      const dispatchData = await dispatchRes.text();
      return new Response(dispatchData, {
        status: dispatchRes.status,
        headers: { ...securityHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (req.method === 'POST' && endpoint === '/api/v1/telemetry/ingest') {
      EdgeRuntime.waitUntil(
        supabaseAdmin.from('telemetry_logs').insert({
          session_id: body.session_id,
          event: body.event,
          app_type: body.app_type,
          timestamp: body.timestamp || new Date().toISOString(),
          details: body.details || {},
          country_code: req.headers.get('CF-IPCountry') || null,
          ip_address: req.headers.get('CF-Connecting-IP') || null
        })
      );

      return new Response(JSON.stringify({ success: true, message: 'Telemetry event accepted' }), {
        status: 202,
        headers: { ...securityHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (req.method === 'POST' && endpoint === '/api/v1/external-webhook') {
      const eventSource = body.event_source;
      if (!eventSource) {
        return new Response(JSON.stringify({ error: 'Missing event_source' }), {
          status: 400,
          headers: { ...securityHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (eventSource === 'tabby') {
        const amount = body.payload?.amount || 0;
        const type = body.payload?.type; // 'revenue' or 'expense'
        const eventTag = type === 'expense' ? 'expense_logged' : 'revenue_cleared';

        if (typeof EdgeRuntime !== 'undefined') {
          EdgeRuntime.waitUntil(
            supabaseAdmin.from('telemetry_logs').insert({
              event: eventTag,
              app_type: 'tabby-accounting',
              timestamp: new Date().toISOString(),
              details: {
                amount,
                raw_payload: body.payload
              }
            })
          );
        }
        return new Response(JSON.stringify({ success: true, message: 'Tabby webhook processed' }), {
          status: 200,
          headers: { ...securityHeaders, 'Content-Type': 'application/json' }
        });
      } else if (eventSource === 'roundups') {
        const eventType = body.payload?.event_type; // 'article_published' or 'affiliate_click'
        const eventTag = eventType === 'article_published' ? 'article_published' : 'affiliate_click';

        if (typeof EdgeRuntime !== 'undefined') {
          EdgeRuntime.waitUntil(
            supabaseAdmin.from('telemetry_logs').insert({
              event: eventTag,
              app_type: 'roundups-affiliate',
              timestamp: new Date().toISOString(),
              details: {
                raw_payload: body.payload
              }
            })
          );
        }
        return new Response(JSON.stringify({ success: true, message: 'RoundUps webhook processed' }), {
          status: 200,
          headers: { ...securityHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ error: 'Unknown event_source' }), {
        status: 400,
        headers: { ...securityHeaders, 'Content-Type': 'application/json' }
      });
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
