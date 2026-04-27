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
  const isInternal = internalKeyHeader === INTERNAL_SERVICE_KEY;

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
      await logSecurityAnomaly('Invalid internal service key attempt');
      await notifyOnyx(endpoint, 403, { reason: 'Invalid internal service key attempt' });
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...securityHeaders, 'Content-Type': 'application/json' }
      });
    }


    if (req.method === 'POST') {
      // Create a cloned request to read body without consuming the original if needed, but since we read it here we can just replace the logic
      const clone = req.clone();
      const text = await clone.text();

      // 5MB limit
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
          // ignore parse error here, will be caught later if needed
        }
      }
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
      let body;
      try {
        body = await req.json();
      } catch (e) {
        return new Response(JSON.stringify({ error: 'Invalid JSON payload' }), {
          status: 400,
          headers: { ...securityHeaders, 'Content-Type': 'application/json' }
        });
      }

      const eventSource = body.event_source;
      if (!eventSource) {
        return new Response(JSON.stringify({ error: 'Missing event_source' }), {
          status: 400,
          headers: { ...securityHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (eventSource === 'tabby') {
        // Map Tabby accounting payloads
        const amount = body.payload?.amount || 0;
        const type = body.payload?.type; // 'revenue' or 'expense'
        const eventTag = type === 'expense' ? 'expense_logged' : 'revenue_cleared';

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
        return new Response(JSON.stringify({ success: true, message: 'Tabby webhook processed' }), {
          status: 200,
          headers: { ...securityHeaders, 'Content-Type': 'application/json' }
        });
      } else if (eventSource === 'roundups') {
        // Map RoundUps affiliate payloads
        const eventType = body.payload?.event_type; // 'article_published' or 'affiliate_click'
        const eventTag = eventType === 'article_published' ? 'article_published' : 'affiliate_click';

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
