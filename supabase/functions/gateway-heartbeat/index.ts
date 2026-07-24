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

    // Fetch ecosystem nodes from database
    const nodesRes = await fetch(`${supabaseUrl}/rest/v1/ecosystem_nodes?select=*`, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!nodesRes.ok) {
      throw new Error(`Failed to fetch ecosystem nodes: ${await nodesRes.text()}`);
    }
    const nodes = await nodesRes.json();

    const failures: string[] = [];

    for (const node of nodes) {
      const url = node.health_endpoint_url;
      if (!url) continue;

      const startTime = Date.now();
      let status = 'operational';
      let pingMs = 0;
      let statusCode = null;

      try {
        const response = await fetch(url, { method: "OPTIONS" });
        pingMs = Date.now() - startTime;
        statusCode = response.status;

        if (!response.ok) {
          status = 'offline';
          failures.push(url);
        }
      } catch (err) {
        console.error(`Failed to reach ${url}:`, err);
        pingMs = Date.now() - startTime;
        status = 'offline';
        failures.push(url);
      }

      // Update ecosystem node in database
      await fetch(`${supabaseUrl}/rest/v1/ecosystem_nodes?id=eq.${node.id}`, {
        method: 'PATCH',
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
          "Prefer": "return=minimal",
        },
        body: JSON.stringify({
          last_ping: new Date().toISOString(),
          ping_ms: pingMs,
          // We only update status if it's not manually overridden. The frontend relies on status field or computes it.
          // Let's just update ping_ms and last_ping to allow EcosystemRegistry to compute it.
        }),
      });
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
