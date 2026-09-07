export default {
    async queue(batch, env) {
        let messages = [];

        for (let msg of batch.messages) {
            let body = msg.body;

            // Validate incoming events for missing/partial geo-metadata
            if (!body.geo) {
                body.geo = {
                    colo: 'unknown',
                    country: 'unknown',
                    city: 'unknown',
                    region: 'unknown'
                };
            }

            messages.push(body);
            msg.ack();
        }

        if (messages.length > 0) {
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

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Failed to bulk insert telemetry logs:', errorText);
                throw new Error(`Failed to bulk insert telemetry logs: ${errorText}`);
            }
        }
    }
};
