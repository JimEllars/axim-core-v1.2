import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: "Configuration error" }), {
        status: 500,
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (authHeader !== `Bearer ${serviceRoleKey}`) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
      });
    }

    const gateways = [
      `${supabaseUrl}/functions/v1/universal-dispatcher`,
      `${supabaseUrl}/functions/v1/onyx-bridge`,
    ];

    const failures: string[] = [];

    for (const url of gateways) {
      try {
        // OPTIONS request to act as a health check since it bypasses most auth and just returns CORS headers
        const response = await fetch(url, { method: "OPTIONS" });
        if (!response.ok) {
          failures.push(url);
        }
      } catch (err) {
        console.error(`Failed to reach ${url}:`, err);
        failures.push(url);
      }
    }

    if (failures.length > 0) {
      const logPayload = {
        event: "System Degraded",
        app_type: "heartbeat-monitor",
        severity: "CRITICAL",
        timestamp: new Date().toISOString(),
        details: {
          failed_gateways: failures,
        },
      };

      await fetch(`${supabaseUrl}/rest/v1/telemetry_logs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify(logPayload),
      });
    }

    return new Response(
      JSON.stringify({ message: "Heartbeat check completed", failures }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Heartbeat Monitor Error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
