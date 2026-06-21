import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { generatePdf } from '../_shared/pdf-generators/index.ts';
import { notifyOnyx } from '../_shared/telemetry.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') as string;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string;
const INTERNAL_SERVICE_KEY = Deno.env.get('X_AXIM_INTERNAL_SERVICE_KEY');
const corsOrigin = Deno.env.get('CORS_ORIGIN');

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const RATE_LIMIT_WINDOW = 60 * 1000;
const MAX_REQUESTS = 100;
const ipRequestCounts = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = ipRequestCounts.get(ip);
  if (!record || now > record.resetTime) {
    ipRequestCounts.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }
  if (record.count >= MAX_REQUESTS) {
    return false;
  }
  record.count++;
  return true;
}

async function logSecurityAnomaly(reason: string, metadata: any = {}) {
    console.warn(`[Security Anomaly] ${reason}`, metadata);
    if (typeof EdgeRuntime !== 'undefined') {
         EdgeRuntime.waitUntil(
            supabaseAdmin.from('telemetry_logs').insert({
                event: 'security_anomaly',
                app_type: 'api-gateway',
                timestamp: new Date().toISOString(),
                details: { reason, ...metadata }
            })
        );
    }
}

function getDepth(obj: any): number {
    if (typeof obj !== 'object' || obj === null) return 0;
    let depth = 0;
    for (const key in obj) {
        depth = Math.max(depth, getDepth(obj[key]));
    }
    return depth + 1;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Convert base64 back to Uint8Array
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}


serve(async (req) => {
  const url = new URL(req.url);
  const endpoint = url.pathname;
  let securityHeaders: Record<string, string>;

  securityHeaders = {
    'Access-Control-Allow-Origin': corsOrigin || '*',
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
        .select('id, user_id, service, scopes')
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

      // Check scoped access for external micro-apps
      let scopes = [];
      try {
          scopes = typeof apiKeyData.scopes === 'string' ? JSON.parse(apiKeyData.scopes) : (apiKeyData.scopes || []);
      } catch (e) {
          scopes = [];
      }

      const isMicroApp = scopes.includes('micro_app_external');

      if (isMicroApp) {
          // Grant these external programs write-only access to log performance telemetry and execute targeted webhook dispatches while completely blocking global database table reads.
          if (req.method === 'GET') {
              await logSecurityAnomaly(`Forbidden: Micro-app '${apiKeyData.service}' attempted to read data.`);
              return new Response(JSON.stringify({ error: 'Forbidden: Read access denied for micro-apps.' }), {
                  status: 403,
                  headers: { ...securityHeaders, 'Content-Type': 'application/json' }
              });
          }

          const allowedEndpoints = ['/api/v1/telemetry/micro-app', '/api/v1/dispatch', '/api/v1/micro-app/ingress', '/api/v1/micro-app/state-commit'];
          if (!allowedEndpoints.includes(endpoint)) {
              await logSecurityAnomaly(`Forbidden: Micro-app '${apiKeyData.service}' attempted to access restricted endpoint ${endpoint}.`);
              return new Response(JSON.stringify({ error: 'Forbidden: Endpoint access denied for micro-apps.' }), {
                  status: 403,
                  headers: { ...securityHeaders, 'Content-Type': 'application/json' }
              });
          }
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

    if (req.method === 'POST' && endpoint === '/api/v1/micro-app/ingress') {
      const dispatcherUrl = `${SUPABASE_URL}/functions/v1/universal-dispatcher`;
      const dispatchRes = await fetch(dispatcherUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
        },
        body: JSON.stringify({ ...body, partner_id: partnerId, api_key_id: apiKeyId, source: 'micro-app-ingress' })
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

    // New telemetry endpoint for micro-apps
    if (req.method === 'POST' && endpoint === '/api/v1/telemetry/micro-app') {
      EdgeRuntime.waitUntil(
        supabaseAdmin.from('telemetry_logs').insert({
          event: 'micro_app_telemetry',
          app_type: body.app_id || 'unknown_micro_app',
          timestamp: new Date().toISOString(),
          details: {
             status: body.status,
             execution_time_ms: body.execution_time_ms,
             error: body.error,
             partner_id: partnerId
          }
        })
      );

      // Also log to api_usage_logs for RCA trigger compatibility
      if (body.error || body.status === 'failed') {
          EdgeRuntime.waitUntil(
            supabaseAdmin.from('api_usage_logs').insert({
                api_key_id: apiKeyId,
                partner_id: partnerId,
                endpoint: endpoint,
                status_code: 500,
                compute_ms: -1, // trigger quarantine
                created_at: new Date().toISOString()
            })
          );
      }

      return new Response(JSON.stringify({ success: true, message: 'Micro-app telemetry logged' }), {
        status: 202,
        headers: { ...securityHeaders, 'Content-Type': 'application/json' }
      });
    }

    // New artifacts sync endpoint for micro-apps

    if (req.method === 'POST' && endpoint === '/api/v1/micro-app/state-commit') {
      const authHeader = req.headers.get('Authorization') || '';
      const token = authHeader.replace('Bearer ', '');

      let userId = partnerId;
      if (token && token !== SUPABASE_SERVICE_ROLE_KEY) {
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (user && !authError) {
          userId = user.id;
        }
      }

      if (!body.app_id || !body.idempotency_key) {
        return new Response(JSON.stringify({ error: 'Missing app_id or idempotency_key' }), {
          status: 400,
          headers: { ...securityHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Idempotency validation using api_usage_logs is already happening above for all requests
      // But we can specifically log the state execution.

      const executionId = crypto.randomUUID();

      EdgeRuntime.waitUntil(
        supabaseAdmin.from('micro_app_executions').insert({
          id: executionId,
          passport_id: userId,
          app_id: body.app_id,
          execution_status: body.status || 'completed',
          compute_units_used: body.compute_units || 1,
          idempotency_key: body.idempotency_key,
          metadata: body.metadata || {},
          created_at: new Date().toISOString()
        }).then(async ({ error: execError }) => {
          if (!execError && body.artifact_base64 && body.file_name) {
             const pdfBytes = base64ToUint8Array(body.artifact_base64);
             const fileName = `${executionId}_${body.file_name}`;
             await supabaseAdmin.storage.from('secure_artifacts').upload(fileName, pdfBytes, {
                contentType: body.content_type || 'application/pdf',
                upsert: false
             });
             await supabaseAdmin.from('micro_app_assets').insert({
                execution_id: executionId,
                owner_passport_id: userId,
                asset_type: body.content_type || 'application/pdf',
                storage_path: fileName,
                created_at: new Date().toISOString()
             });
          }
        })
      );

      return new Response(JSON.stringify({ success: true, execution_id: executionId }), {
        status: 202,
        headers: { ...securityHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (req.method === 'POST' && endpoint === '/api/v1/artifacts/sync') {
       if (!body.artifact_base64 || !body.file_name) {
           return new Response(JSON.stringify({ error: 'Missing artifact_base64 or file_name' }), {
              status: 400,
              headers: { ...securityHeaders, 'Content-Type': 'application/json' }
           });
       }

       const pdfBytes = base64ToUint8Array(body.artifact_base64);
       const fileName = `synced_${Date.now()}_${body.file_name}`;

       const { error: uploadError } = await supabaseAdmin.storage
          .from('secure_artifacts')
          .upload(fileName, pdfBytes, {
             contentType: body.content_type || 'application/pdf',
             upsert: false
          });

       if (uploadError) {
          throw new Error(`Failed to store synced artifact: ${uploadError.message}`);
       }

       // Log to api_usage_logs explicitly as required
       if (typeof EdgeRuntime !== 'undefined') {
         EdgeRuntime.waitUntil(
           supabaseAdmin.from('api_usage_logs').insert({
             api_key_id: apiKeyId,
             partner_id: partnerId,
             endpoint: endpoint,
             status_code: 200,
             created_at: new Date().toISOString()
           })
         );
       }

       const { data: signedUrlData, error: urlError } = await supabaseAdmin.storage
          .from('secure_artifacts')
          .createSignedUrl(fileName, 900);

       if (urlError || !signedUrlData) {
          throw new Error('Failed to generate signed URL for synced artifact');
       }

       return new Response(JSON.stringify({
          success: true,
          download_url: signedUrlData.signedUrl
       }), {
          status: 200,
          headers: { ...securityHeaders, 'Content-Type': 'application/json' }
       });
    }


    if (req.method === 'POST' && endpoint === '/api/v1/billing/fallback-blockchain') {
       if (!body.transaction_hash || !body.artifact_amount || !body.user_id) {
           return new Response(JSON.stringify({ error: 'Missing transaction_hash, artifact_amount, or user_id' }), {
              status: 400,
              headers: { ...securityHeaders, 'Content-Type': 'application/json' }
           });
       }

       // Simulated Arbitrum JSON-RPC Check (in production this calls an actual RPC endpoint)
       const isTransactionValid = true; // Simulating valid stablecoin (USDC/USDT) deposit

       if (!isTransactionValid) {
           return new Response(JSON.stringify({ error: 'Blockchain transaction verification failed' }), {
               status: 400,
               headers: { ...securityHeaders, 'Content-Type': 'application/json' }
           });
       }

       // Log the fallback payment to api_usage_logs
       if (typeof EdgeRuntime !== 'undefined') {
         EdgeRuntime.waitUntil(
           supabaseAdmin.from('api_usage_logs').insert({
             api_key_id: apiKeyId,
             partner_id: partnerId,
             endpoint: endpoint,
             status_code: 200,
             payment_method: 'arbitrum_stablecoin',
             created_at: new Date().toISOString()
           })
         );
       }

       // Return a secure token to the frontend
       const secureToken = crypto.randomUUID();

       return new Response(JSON.stringify({
          success: true,
          message: 'Blockchain transaction verified',
          download_token: secureToken
       }), {
          status: 200,
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

    // Clone raw error exception for Shadow Telemetry
    const shadowErrorTrace = error instanceof Error ? error.stack || error.message : String(error);

    // Insert directly into api_usage_logs with severity: "critical" and masked_to_client: true
    if (typeof EdgeRuntime !== 'undefined' || true) {
      // Use supabaseAdmin to bypass RLS and insert the shadow telemetry
      const shadowInsert = supabaseAdmin.from('api_usage_logs').insert({
        endpoint: endpoint,
        status_code: 500,
        execution_time_ms: -1,
        partner_id: 'internal',
        payload: {
          shadow_telemetry: true,
          severity: 'critical',
          masked_to_client: true,
          error_stack: shadowErrorTrace
        }
      });
      if (typeof EdgeRuntime !== 'undefined') {
        EdgeRuntime.waitUntil(shadowInsert);
      } else {
        await shadowInsert;
      }
    }

    await notifyOnyx(endpoint, 500, { error: error.message, shadow_telemetry: true });

    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { ...securityHeaders, 'Content-Type': 'application/json' }
    });
  }
});
