import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const MICRO_APPS = [
  "https://quickdemandletter.com",
  "https://your-nda-domain.com"
];

serve(async () => {
    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

        if (!supabaseUrl || !serviceRoleKey) {
            console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
            return new Response(JSON.stringify({ error: "Configuration error" }), { status: 500 });
        }

        const failures: string[] = [];

        for (const url of MICRO_APPS) {
            try {
                const response = await fetch(url, { method: 'GET' });
                if (!response.ok) {
                    failures.push(url);
                }
            } catch (err) {
                console.error(`Failed to reach ${url}:`, err);
                failures.push(url);
            }
        }

        if (failures.length > 0) {
            // Log to telemetry_logs
            for (const url of failures) {
                const logPayload = {
                    event: 'uptime_failure',
                    severity: 'CRITICAL',
                    details: {
                        url: url,
                        timestamp: new Date().toISOString()
                    }
                };

                const insertRes = await fetch(`${supabaseUrl}/rest/v1/telemetry_logs`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': serviceRoleKey,
                        'Authorization': `Bearer ${serviceRoleKey}`
                    },
                    body: JSON.stringify(logPayload)
                });

                if (!insertRes.ok) {
                    const errorText = await insertRes.text();
                    console.error("Failed to insert telemetry log:", errorText);
                }
            }
        }

        return new Response(JSON.stringify({ message: "Uptime check completed", failures }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        });

    } catch (error) {
        console.error("Uptime Monitor Error:", error);
        return new Response(JSON.stringify({ error: "Internal server error" }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
});
