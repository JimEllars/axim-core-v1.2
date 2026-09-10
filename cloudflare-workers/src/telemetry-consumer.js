export default {
    async queue(batch, env) {
        let messages = [];

        for (let msg of batch.messages) {
            let body = msg.body;

            // Extract trace id if passed in headers and added to body by producer
            // (Assuming producer sets body.trace_id or body.headers)

            // Validate incoming events for missing/partial geo-metadata
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

        if (messages.length > 0) {
            let success = false;
            let attempts = 0;
            const maxAttempts = 3;
            const baseBackoff = 1000;

            while (attempts < maxAttempts && !success) {
                try {
                    const url = `${env.SUPABASE_URL}/rest/v1/telemetry_logs`;
                    const response = await fetch(url, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
                            'apikey': env.SUPABASE_SERVICE_ROLE_KEY
                        },
                        body: JSON.stringify(messages)
                    });

                    if (response.ok) {
                        success = true;
                    } else if (response.status >= 500) {
                        const errorText = await response.text();
                        console.error(`Failed to bulk insert telemetry logs (5xx):`, errorText);
                        throw new Error(`5xx error: ${response.status}`);
                    } else {
                        const errorText = await response.text();
                        console.error('Failed to bulk insert telemetry logs (non-5xx):', errorText);
                        // Don't retry on 4xx
                        throw new Error(`4xx error: ${response.status}`);
                    }
                } catch (e) {
                    attempts++;
                    if (attempts >= maxAttempts) {
                        console.error('Max retries reached for telemetry insertion', e);
                        // Fallback to KV buffering if upstream returns 5xx and KV is configured
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
                        // Exponential backoff with jitter
                        const jitter = Math.random() * 500;
                        const backoff = baseBackoff * Math.pow(2, attempts - 1) + jitter;
                        await new Promise(resolve => setTimeout(resolve, backoff));
                    }
                }
            }
        }

        // Acknowledge all messages in the batch since we've processed or buffered them
        for (let msg of batch.messages) {
            msg.ack();
        }
    }
};
