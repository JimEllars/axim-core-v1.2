export default {
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
                            } else {
                                console.error(`Failed to drain KV key: ${key.name}, Status: ${response.status}`);
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

        let messages = [];

        for (let msg of batch.messages) {
            let body = msg.body;

            if (Array.isArray(body.events)) {
                body.events.forEach(event => {
                    messages.push({
                        ...event,
                        geo: body.geo || {
                            colo: 'UNKNOWN',
                            country: 'XX',
                            city: null,
                            region: null,
                            asn: null,
                            cf_ray: null
                        },
                        component_id: event.app_id || 'core_api',
                        severity: event.severity || 'INFO',
                        message: event.event || 'unknown_event',
                        payload: event.details || {},
                        idempotency_key: event.trace_id || null
                    });
                });
            } else {
                if (!body.geo) {
                    body.geo = {
                        colo: 'UNKNOWN',
                        country: 'XX',
                        city: null,
                        region: null,
                        asn: null,
                        cf_ray: null
                    };
                }
                messages.push(body);
            }
        }

        if (messages.length > 0) {
            let success = false;
            let attempts = 0;
            const maxAttempts = 3;
            const baseBackoff = 1000;

            while (attempts < maxAttempts && !success) {
                try {
                    const url = `${env.SUPABASE_URL}/rest/v1/telemetry_events`;
                    const response = await fetch(url, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
                            'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
                            'Prefer': 'resolution=ignore-duplicates' // Prevent errors if idempotency_key matches
                        },
                        body: JSON.stringify(messages)
                    });

                    if (response.ok) {
                        success = true;
                    } else if (response.status >= 500 || response.status === 429) {
                        const errorText = await response.text();
                        console.error(`Failed to bulk insert telemetry logs (${response.status}):`, errorText);
                        throw new Error(`${response.status} error: ${response.status}`);
                    } else {
                        const errorText = await response.text();
                        console.error('Failed to bulk insert telemetry logs (non-retryable):', errorText);
                        // Don't retry on 4xx (except 429)
                        success = true; // We don't want to retry or KV this
                    }
                } catch (e) {
                    attempts++;
                    if (attempts >= maxAttempts) {
                        console.error('Max retries reached for telemetry insertion', e);
                        if (env.KV) {
                            try {
                                const bufferKey = `telemetry_buffer_${Date.now()}_${Math.random().toString(36).substring(7)}`;
                                await env.KV.put(bufferKey, JSON.stringify(messages), { expirationTtl: 86400 });
                                console.log(`Buffered ${messages.length} telemetry messages to KV`);
                            } catch (kvError) {
                                console.error('Failed to buffer telemetry to KV', kvError);
                                throw kvError;
                            }
                        } else {
                            throw e;
                        }
                    } else {
                        const jitter = Math.random() * 500;
                        const backoff = baseBackoff * Math.pow(2, attempts - 1) + jitter;
                        await new Promise(resolve => setTimeout(resolve, backoff));
                    }
                }
            }
        }

        for (let msg of batch.messages) {
            msg.ack();
        }
    }
};
