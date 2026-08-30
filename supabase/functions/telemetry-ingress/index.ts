import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'
import { hmac } from "https://deno.land/x/hmac@v2.0.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-axim-trace-id, x-axim-signature, idempotency-key, user-agent',
}

function truncateString(str: string, maxLength: number): string {
    if (typeof str !== 'string') return str;
    return str.length > maxLength ? str.substring(0, maxLength) + '... [TRUNCATED]' : str;
}

function limitPayloadSize(payload: any, maxStringLength: number = 2000): any {
    if (!payload) return payload;

    if (typeof payload === 'string') {
        return truncateString(payload, maxStringLength);
    }

    if (typeof payload === 'object') {
        if (Array.isArray(payload)) {
            return payload.map(item => limitPayloadSize(item, maxStringLength));
        }

        const limited = { ...payload };
        for (const key in limited) {
            if (Object.prototype.hasOwnProperty.call(limited, key)) {
                limited[key] = limitPayloadSize(limited[key], maxStringLength);
            }
        }
        return limited;
    }

    return payload;
}

const ALLOWED_APPS = [
    'axim-passport-sso',
    'axim-web3-frontend',
    'axim-ceo-dept-app',
    'axim-cfo-app',
    'green-machine',
    'groundgame-support',
    'onyx_edge_worker'
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const rawBodyText = await req.text();
    let rawPayload;
    try {
        rawPayload = JSON.parse(rawBodyText);
    } catch(e) {
        rawPayload = { message: rawBodyText };
    }

    const clientIp = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || 'unknown_ip';
    const userAgent = req.headers.get('user-agent') || 'unknown_agent';
    const authHeader = req.headers.get('Authorization') || '';
    const traceId = req.headers.get('X-AXiM-Trace-ID') || 'no_trace_id';
    const idempotencyKey = req.headers.get('Idempotency-Key') || req.headers.get('idempotency-key') || null;
    const signature = req.headers.get('X-Axim-Signature') || req.headers.get('x-axim-signature');

    const internalKey = Deno.env.get('AXIM_INTERNAL_KEY') || '';

    // Verify Authentication
    let isAuthenticated = false;

    if (authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        if (token === internalKey) {
            isAuthenticated = true;
        }
    } else if (signature && internalKey) {
        // HMAC SHA-256 validation
        const computedSignature = hmac("sha256", internalKey, rawBodyText, "utf8", "hex");
        if (computedSignature === signature) {
            isAuthenticated = true;
        }
    }

    if (!isAuthenticated) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    // Check Idempotency if provided
    if (idempotencyKey) {
        const { data: existingLog } = await supabaseClient
            .from('api_usage_logs')
            .select('id')
            .eq('idempotency_key', idempotencyKey)
            .single();

        if (existingLog) {
            return new Response(JSON.stringify({ success: true, cached: true }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200
            });
        }
    }

    // Ensure we are working with an object or array
    let processedPayload = rawPayload;
    if (typeof rawPayload === 'string') {
        processedPayload = { message: rawPayload };
    }

    // Handle arrays (e.g. bulk telemetry)
    const isArray = Array.isArray(processedPayload);
    const payloadsToProcess = isArray ? processedPayload : [processedPayload];

    // Process each payload in the background
    const processTelemetry = async () => {
      try {
        for (const p of payloadsToProcess) {
            const app_id = p.app_id || 'unknown_app';
            if (!ALLOWED_APPS.includes(app_id) && app_id !== 'unknown_app') {
               console.warn(`Unrecognized app_id: ${app_id}`);
            }

            const currentTraceId = p.metadata?.['X-AXiM-Trace-ID'] || traceId;

            // Import sanitization dynamically
            const { sanitizePayload } = await import('../telemetry-archiver/sanitization.ts');

            // 1. Sanitize
            const sanitizedPayload = sanitizePayload(p);

            // 2. Limit size to prevent database bloat
            const limitedPayload = limitPayloadSize(sanitizedPayload);

            const oneMinuteAgo = new Date(Date.now() - 60000).toISOString()

            // Check request count for this specific IP within the last minute
            const { count, error: countError } = await supabaseClient
            .from('telemetry_logs')
            .select('*', { count: 'exact', head: true })
            .eq('app_type', app_id)
            .eq('ip_address', clientIp)
            .gte('timestamp', oneMinuteAgo)

            if (countError) throw countError

            if (count !== null && count >= 10) {
            // Log the violation in api_usage_logs
            await supabaseClient.from('api_usage_logs').insert({
                endpoint: '/telemetry-ingress',
                status_code: 429,
                // Using -1 to indicate an anomaly/violation
                compute_ms: -1
            })

            continue; // Skip processing this payload
            }

            const target_department = limitedPayload.target_department || 'CORE';

            if (target_department !== 'CORE') {
            await (async () => {
            const useCfQueue = Deno.env.get('USE_CF_TELEMETRY_QUEUE') === 'true';
            const payloadToLog = {
                event: 'department_dispatch',
                app_type: app_id,
                ip_address: clientIp,
                details: { department: target_department, original_payload: limitedPayload },
                timestamp: new Date().toISOString()
            };
            if (useCfQueue) {
                const workerUrl = Deno.env.get('TELEMETRY_WORKER_URL');
                if (workerUrl) {
                    await fetch(workerUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payloadToLog)
                    }).catch(e => console.error('Failed to queue telemetry', e));
                } else {
                    await supabaseClient.from('telemetry_logs').insert(payloadToLog);
                }
            } else {
                await supabaseClient.from('telemetry_logs').insert(payloadToLog);
            }
            })();
            }

            // Insert the telemetry event
            const { error: insertEventError } = await supabaseClient.from('telemetry_events').insert({
                component_id: app_id === 'unknown_app' ? 'core_api' : (app_id === 'onyx_edge_worker' ? 'onyx_bridge' : 'core_api'), // Defaulting for enum constraints
                environment: 'production',
                severity: limitedPayload.severity || 'INFO',
                message: limitedPayload.message || limitedPayload.event || 'generic_telemetry',
                payload: { ...limitedPayload.details || limitedPayload, ip_address: clientIp, user_agent: userAgent },
                idempotency_key: idempotencyKey,
            });

            if (insertEventError && insertEventError.code !== '22P02') {
                console.error("Insert telemetry_events error:", insertEventError);
                // Fallback to events_ax2024 if telemetry_events enum is strict and we didn't map it right
                await supabaseClient.from('events_ax2024').insert({
                    type: limitedPayload.event || 'generic_telemetry',
                    source: app_id,
                    data: { ...limitedPayload.details || limitedPayload, ip_address: clientIp, user_agent: userAgent },
                    created_at: new Date().toISOString()
                });
            }

            // Insert API Usage Log
            const { error: insertUsageError } = await supabaseClient.from('api_usage_logs').insert({
                endpoint: limitedPayload.endpoint || '/telemetry-ingress',
                status_code: limitedPayload.status_code || 200,
                execution_time_ms: limitedPayload.execution_time_ms || 0,
                compute_ms: limitedPayload.compute_ms || 50,
                app_id: app_id,
                idempotency_key: idempotencyKey,
                payload: {
                    ...limitedPayload.metadata,
                    trace_id: currentTraceId,
                    auth_context: 'authenticated',
                    ip_address: clientIp,
                    user_agent: userAgent
                }
            });

            if(insertUsageError) {
                 console.error("Insert api_usage_logs error:", insertUsageError);
            }
        }
      } catch (err) {
        console.error("Background telemetry processing error:", err);
      }
    };

    // Use EdgeRuntime.waitUntil if available (Supabase/Deno environment), otherwise just run it
    if (typeof (globalThis as any).EdgeRuntime !== 'undefined' && (globalThis as any).EdgeRuntime.waitUntil) {
      (globalThis as any).EdgeRuntime.waitUntil(processTelemetry());
    } else {
      // Fallback for environments without EdgeRuntime
      processTelemetry();
    }

    return new Response(
      JSON.stringify({ success: true, edge_queued: true, processed: payloadsToProcess.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 202 }
    )

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
