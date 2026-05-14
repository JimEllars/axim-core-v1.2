import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

serve(async () => {
    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

        if (!supabaseUrl || !serviceRoleKey) {
            console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
            return new Response(JSON.stringify({ error: "Configuration error" }), { status: 500 });
        }

        const supabase = createClient(supabaseUrl, serviceRoleKey);

        const { data: nodes, error: fetchError } = await supabase
            .from('ecosystem_nodes')
            .select('*');

        if (fetchError) {
            console.error("Failed to fetch ecosystem_nodes:", fetchError);
            return new Response(JSON.stringify({ error: "Failed to fetch ecosystem_nodes" }), { status: 500 });
        }

        const failures: any[] = [];

        for (const node of nodes) {
            let isDown = false;
            try {
                const response = await fetch(node.health_endpoint_url, { method: 'GET', signal: AbortSignal.timeout(5000) });
                if (!response.ok) {
                    isDown = true;
                }
            } catch (err) {
                console.error(`Failed to reach ${node.health_endpoint_url}:`, err);
                isDown = true;
            }

            if (isDown) {
                failures.push(node);
                // Update status to offline
                await supabase
                    .from('ecosystem_nodes')
                    .update({ status: 'offline', last_ping: new Date().toISOString() })
                    .eq('id', node.id);

                // Emitting the event to telemetry_logs
                const logPayload = {
                    event: 'ECOSYSTEM_NODE_DOWN',
                    severity: 'CRITICAL',
                    details: {
                        app_name: node.app_name,
                        health_endpoint_url: node.health_endpoint_url,
                        timestamp: new Date().toISOString()
                    }
                };

                const insertRes = await supabase
                    .from('telemetry_logs')
                    .insert(logPayload);

                if (insertRes.error) {
                    console.error("Failed to insert telemetry log:", insertRes.error);
                }
            } else {
                // Update status to online
                await supabase
                    .from('ecosystem_nodes')
                    .update({ status: 'online', last_ping: new Date().toISOString() })
                    .eq('id', node.id);
            }
        }

        return new Response(JSON.stringify({ message: "Uptime check completed", failures: failures.map(f => f.app_name) }), {
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
