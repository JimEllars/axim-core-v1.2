export default {
    async fetch(request, env) {
        if (request.method !== 'POST') {
            return new Response('Method not allowed', { status: 405 });
        }
        try {
            const body = await request.json();
            // Process HTTP payload
            let messages = [];
            if (Array.isArray(body)) {
                messages = body;
            } else if (body.events && Array.isArray(body.events)) {
                messages = body.events;
            } else {
                messages = [body];
            }

            const mockBatch = {
                messages: messages.map(msg => ({
                    body: msg,
                    ack: () => {}
                }))
            };
            await this.queue(mockBatch, env);
            return new Response('OK', { status: 200 });
        } catch (e) {
            return new Response('Bad request', { status: 400 });
        }
    },

    async queue(batch, env) {
        // Drain KV fallback buffer
        if (env.KV) {
            try {
                const list = await env.KV.list({ prefix: 'telemetry_buffer_', limit: 2 });
                for (const key of list.keys) {
                    const value = await env.KV.get(key.name);
                    if (value) {
                        try {
                            const url = `${env.SUPABASE_URL}/rest/v1/telemetry_events`;
                            const response = await fetch(url, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
                                    'apikey': env.SUPABASE_SERVICE_ROLE_KEY
                                },
                                body: value
                            });

                            if (response.ok) {
                                await env.KV.delete(key.name);
                                console.log(`Successfully drained and deleted KV key: ${key.name}`);
                            }
                        } catch (e) {
                            console.error(`Error draining KV key: ${key.name}`, e);
                        }
                    }
                }
            } catch (listError) {
                console.error('Failed to list KV buffer keys', listError);
            }
        }

        let telemetryMessages = [];
        let apiUsageMessages = [];

        for (let msg of batch.messages) {
            let body = msg.body;

            const processEvent = (event) => {
                // Ensure payload structure: { app_id, event_type, timestamp, metadata } -> mappings
                const payloadMetadata = event.metadata || event.details || {};

                telemetryMessages.push({
                    component_id: event.app_id || 'core_api',
                    severity: event.severity || 'INFO',
                    message: event.event_type || event.event || 'unknown_event',
                    payload: payloadMetadata,
                    idempotency_key: event.trace_id || null,
                    geo: body.geo || { colo: 'UNKNOWN', country: 'XX' },
                    created_at: event.timestamp || new Date().toISOString()
                });

                if (payloadMetadata.prompt_tokens || payloadMetadata.prompt_cache_hit_tokens) {
                    apiUsageMessages.push({
                        app_id: event.app_id || 'core_api',
                        endpoint: event.event_type || 'llm_call',
                        client_id: event.client_id || 'unknown',
                        status_code: 200,
                        execution_time_ms: payloadMetadata.execution_time_ms || 0,
                        request_metadata: payloadMetadata,
                        created_at: event.timestamp || new Date().toISOString()
                    });
                }
            };

            if (Array.isArray(body.events)) {
                body.events.forEach(processEvent);
            } else if (Array.isArray(body)) {
                body.forEach(processEvent);
            } else {
                processEvent(body);
            }
        }

        const insertToSupabase = async (endpoint, data) => {
            if (data.length === 0) return true;
            let success = false;
            let attempts = 0;
            const maxAttempts = 3;
            const baseBackoff = 1000;

            while (attempts < maxAttempts && !success) {
                try {
                    const url = `${env.SUPABASE_URL}/rest/v1/${endpoint}`;
                    const response = await fetch(url, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
                            'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
                            'Prefer': 'resolution=ignore-duplicates'
                        },
                        body: JSON.stringify(data)
                    });

                    if (response.ok || response.status === 409) {
                        success = true;
                    } else if (response.status >= 500 || response.status === 429) {
                        throw new Error(`${response.status} error`);
                    } else {
                        // Non-retryable
                        success = true;
                    }
                } catch (e) {
                    attempts++;
                    if (attempts >= maxAttempts) {
                        return false; // Failed
                    }
                    const backoff = baseBackoff * Math.pow(2, attempts - 1) + Math.random() * 500;
                    await new Promise(resolve => setTimeout(resolve, backoff));
                }
            }
            return success;
        };

        const telemetrySuccess = await insertToSupabase('telemetry_events', telemetryMessages);

        if (!telemetrySuccess && env.KV && telemetryMessages.length > 0) {
            try {
                const bufferKey = `telemetry_buffer_${Date.now()}_${Math.random().toString(36).substring(7)}`;
                await env.KV.put(bufferKey, JSON.stringify(telemetryMessages), { expirationTtl: 86400 });
            } catch (kvError) {
                console.error('Failed to buffer to KV', kvError);
            }
        }

        await insertToSupabase('api_usage_logs', apiUsageMessages);

        for (let msg of batch.messages) {
            msg.ack();
        }
    }
};
