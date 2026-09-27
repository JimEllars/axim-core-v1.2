const jsonRpcError = (id, code, message) => ({
  jsonrpc: "2.0",
  error: { code, message },
  id
});

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Axim-Gateway-Token"
        }
      });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const authHeader = request.headers.get("Authorization");
    const aximGatewayToken = request.headers.get("x-axim-gateway-token");
    const keyHeader = request.headers.get("X-Axim-Gateway-Token");

    // Check MCP Bridge Authentication
    let isAuthenticated = false;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      isAuthenticated = authHeader.substring(7) === env.AXIM_GATEWAY_TOKEN;
    } else if (keyHeader) {
      isAuthenticated = keyHeader === env.AXIM_GATEWAY_TOKEN;
    }

    // Default key for testing if env var not set
    if (!env.AXIM_GATEWAY_TOKEN && (authHeader === "Bearer test-key" || keyHeader === "test-key")) {
      isAuthenticated = true;
    }

    if (!isAuthenticated) {
      return new Response(
        JSON.stringify(jsonRpcError(null, -32001, "Unauthorized: Invalid or missing MCP authentication key")),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    try {
      const payload = await request.json();
      const { method, params, id } = payload;

      if (!method) {
        return new Response(
          JSON.stringify(jsonRpcError(id, -32600, "Invalid Request")),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      if (method === "tools/list") {
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            result: {
              tools: [
                {
                  name: "axim_ping",
                  description: "Simple ping to check gateway reachability.",
                  inputSchema: { type: "object", properties: {} }
                },
                {
                  name: "workflow_dispatch",
                  description: "Dispatches a predefined workflow.",
                  inputSchema: { type: "object", properties: { workflow_type: { type: "string" }, payload: { type: "object" }, trigger_source: { type: "string" } } }
                },
                {
                  name: "core_health_check",
                  description: "Reports database connectivity, edge worker latency, and queue depths.",
                  inputSchema: { type: "object", properties: {} }
                },
                {
                  name: "telemetry_lookup",
                  description: "Allows authorized agents to fetch recent incident metrics.",
                  inputSchema: {
                    type: "object",
                    properties: {
                      limit: { type: "number", description: "Number of events to return" },
                      app_id: { type: "string", description: "Filter by App ID" }
                    }
                  }
                },
                {
                  name: "hitl_queue_status",
                  description: "Returns counts and IDs of pending approval items.",
                  inputSchema: { type: "object", properties: {} }
                }
              ]
            },
            id
          }),
          { headers: { "Content-Type": "application/json" } }
        );
      }

      if (method === "tools/call") {
        const toolName = params?.name;
        const toolArgs = params?.arguments || {};
        if (!toolName) {
           return new Response(
            JSON.stringify(jsonRpcError(id, -32602, "Invalid params: missing tool name")),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }

        if (toolName === "axim_ping") {
          return new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              result: {
                content: [{ type: "text", text: "pong" }],
                isError: false
              },
              id
            }),
            { headers: { "Content-Type": "application/json" } }
          );
        }

        if (toolName === "workflow_dispatch") {
          let dispatchStatus = "Failed";
          if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
             try {
                 const { workflow_type, payload, trigger_source } = toolArgs;
                 const response = await fetch(`${env.SUPABASE_URL}/rest/v1/satellite_job_queue`, {
                   method: 'POST',
                   headers: {
                      "Content-Type": "application/json",
                      "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
                      "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
                      "Prefer": "return=minimal"
                   },
                   body: JSON.stringify({
                       workflow_type,
                       payload,
                       trigger_source,
                       status: 'pending'
                   })
                 });
                 if (response.ok) {
                     dispatchStatus = `Dispatched workflow ${workflow_type || 'unknown'}`;
                 } else {
                     dispatchStatus = `Error: ${response.status}`;
                 }
             } catch(e) {
                 dispatchStatus = `Error: ${e.message}`;
             }
          }
          return new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              result: {
                content: [{ type: "text", text: dispatchStatus }],
                isError: dispatchStatus.startsWith('Error')
              },
              id
            }),
            { headers: { "Content-Type": "application/json" } }
          );
        }

        if (toolName === "core_health_check") {
          let systemHealth = {
            timestamp: new Date().toISOString(),
            status: "simulated",
            db_connectivity: "unknown",
            latency_ms: 0,
            active_llm_provider: "deepseek",
            queues: {}
          };

          if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
            try {
               const startTime = Date.now();
               // Basic health check
               const response = await fetch(`${env.SUPABASE_URL}/rest/v1/telemetry_events?select=id&limit=1`, {
                 headers: {
                    "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
                    "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
                 }
               });
               systemHealth.latency_ms = Date.now() - startTime;
               if(response.ok) {
                 systemHealth.status = "healthy";
                 systemHealth.db_connectivity = "ok";

                 // Could query dead_letter_jobs here, but keeping it simple as per instructions
                 // "Reports database connectivity, edge worker latency, and queue depths."
                 const dlqResponse = await fetch(`${env.SUPABASE_URL}/rest/v1/dead_letter_jobs?select=id,status&status=eq.pending`, {
                   headers: {
                      "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
                      "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
                      "Prefer": "count=exact,head=true"
                   }
                 });
                 if (dlqResponse.ok) {
                   const count = dlqResponse.headers.get("content-range")?.split("/")?.[1] || "0";
                   systemHealth.queues.dead_letter_jobs = { pending: parseInt(count, 10) };
                 }
               } else {
                 systemHealth.status = "degraded";
                 systemHealth.db_connectivity = `error: ${response.status}`;
               }
            } catch(e) {
               systemHealth.status = "error";
               systemHealth.db_connectivity = `error: ${e.message}`;
            }
          }
          return new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              result: {
                content: [{ type: "text", text: JSON.stringify(systemHealth, null, 2) }],
                isError: systemHealth.status === "error"
              },
              id
            }),
            { headers: { "Content-Type": "application/json" } }
          );
        }

        if (toolName === "telemetry_lookup") {
          let telemetryData = "Telemetry data simulated";
          if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
             try {
                const limit = toolArgs.limit || 10;
                let url = `${env.SUPABASE_URL}/rest/v1/telemetry_events?select=*&order=created_at.desc&limit=${limit}`;
                if (toolArgs.app_id) {
                   url += `&component_id=eq.${encodeURIComponent(toolArgs.app_id)}`;
                }
                const response = await fetch(url, {
                   headers: {
                      "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
                      "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
                   }
                });
                if (response.ok) {
                   const data = await response.json();
                   telemetryData = JSON.stringify(data, null, 2);
                } else {
                   telemetryData = `Error fetching telemetry: ${response.status}`;
                }
             } catch(e) {
                telemetryData = `Error: ${e.message}`;
             }
          }
          return new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              result: {
                content: [{ type: "text", text: telemetryData }],
                isError: false
              },
              id
            }),
            { headers: { "Content-Type": "application/json" } }
          );
        }

        if (toolName === "hitl_queue_status") {
          let queueStatus = "HITL queue status simulated";
          if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
             try {
                // Check both lowercase and PascalCase 'Pending' depending on how it was inserted
                const url = `${env.SUPABASE_URL}/rest/v1/hitl_audit_logs?select=id,status,action,created_at,risk_level&or=(status.eq.Pending,status.eq.pending)`;
                const response = await fetch(url, {
                   headers: {
                      "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
                      "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
                      "Prefer": "count=exact"
                   }
                });
                if (response.ok) {
                   const count = response.headers.get("content-range")?.split("/")?.[1] || "0";
                   const data = await response.json();
                   const highRiskCount = data.filter(d => d.risk_level === 'high' || d.action?.toLowerCase().includes('high')).length;
                   queueStatus = JSON.stringify({ pending_count: parseInt(count, 10), high_risk_count: highRiskCount, pending_items: data }, null, 2);
                } else {
                   queueStatus = `Error fetching HITL queue: ${response.status}`;
                }
             } catch(e) {
                queueStatus = `Error: ${e.message}`;
             }
          }
          return new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              result: {
                content: [{ type: "text", text: queueStatus }],
                isError: false
              },
              id
            }),
            { headers: { "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify(jsonRpcError(id, -32601, `Tool not found: ${toolName}`)),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify(jsonRpcError(id, -32601, `Method not found: ${method}`)),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );

    } catch (error) {
      return new Response(
        JSON.stringify(jsonRpcError(null, -32700, "Parse error")),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
  }
};
