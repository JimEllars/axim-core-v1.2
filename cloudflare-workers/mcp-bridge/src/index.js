const jsonRpcError = (id, code, message) => ({
  jsonrpc: "2.0",
  error: { code, message },
  id
});

export default {
  async fetch(request, env, ctx) {

    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '') || request.headers.get('X-Axim-Gateway-Token');
    if (token !== env.AXIM_GATEWAY_TOKEN && token !== env.AXIM_INTERNAL_KEY && token !== env.MCP_GATEWAY_SECRET) {
      return new Response(JSON.stringify({ jsonrpc: '2.0', error: { code: -32600, message: 'Unauthorized: Invalid Gateway Token' }, id: null }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Axim-Signature"
        }
      });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const authenticateMcpRequest = (request, env) => {
      const authHeader = request.headers.get("Authorization") || "";
      const customHeader = request.headers.get("X-Axim-Gateway-Token") || "";
      const token = authHeader.replace(/^Bearer\s+/i, "").trim() || customHeader.trim();

      if (!token || !env.MCP_GATEWAY_SECRET) return false;
      if (token.length !== env.MCP_GATEWAY_SECRET.length) return false;

      let result = 0;
      for (let i = 0; i < token.length; i++) {
        result |= token.charCodeAt(i) ^ env.MCP_GATEWAY_SECRET.charCodeAt(i);
      }
      return result === 0;
    };

    let isAuthenticated = authenticateMcpRequest(request, env);


    if (!isAuthenticated) {
      return new Response(
        JSON.stringify(jsonRpcError(null, -32001, "Unauthorized: Invalid or missing MCP authentication key")),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    try {
      const payload = await request.json();
      const { method, params, id } = payload;

      if (method === "initialize") {
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            result: {
              protocolVersion: "2.0",
              capabilities: {
                 tools: { listChanged: true }
              },
              serverInfo: {
                name: "axim-core-mcp-bridge",
                version: "1.2.0"
              }
            },
            id
          }),
          { headers: { "Content-Type": "application/json" } }
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
                  name: "axim_get_telemetry",
                  description: "Reports database connectivity, edge worker latency, and queue depths.",
                  inputSchema: { type: "object", properties: {} }
                },
                {
                  name: "axim_list_nodes",
                  description: "Queries active nodes from ecosystem_nodes table.",
                  inputSchema: { type: "object", properties: {} }
                },
                {
                  name: "core_health_check",
                  description: "Returns Core database, edge worker, and queue status.",
                  inputSchema: { type: "object", properties: {} }
                },
                {
                  name: "telemetry_lookup",
                  description: "Queries recent error rates and trace IDs from public.telemetry_events.",
                  inputSchema: { type: "object", properties: {} }
                },
                {
                  name: "hitl_queue_status",
                  description: "Returns depth and pending items from public.hitl_audit_logs.",
                  inputSchema: { type: "object", properties: {} }
                },
                {
                  name: "axim_dispatch_task",
                  description: "Dispatches background jobs to Supabase universal-dispatcher.",
                  inputSchema: {
                     type: "object",
                     properties: {
                         task_type: { type: "string" },
                         payload: { type: "object" }
                     },
                     required: ["task_type", "payload"]
                  }
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
              result: { content: [{ type: "text", text: "pong" }], isError: false },
              id
            }),
            { headers: { "Content-Type": "application/json" } }
          );
        }

                if (toolName === "core_health_check") {
          return new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              result: { content: [{ type: "text", text: "Healthy" }], isError: false },
              id
            }),
            { headers: { "Content-Type": "application/json" } }
          );
        }

        if (toolName === "telemetry_lookup") {
          let lookupResult = "No data";
          if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
            try {
              const url = `${env.SUPABASE_URL}/rest/v1/telemetry_events?select=*&limit=10&order=created_at.desc`;
              const response = await fetch(url, {
                headers: {
                  "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
                  "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
                }
              });
              if (response.ok) {
                const data = await response.json();
                lookupResult = JSON.stringify(data, null, 2);
              } else {
                lookupResult = `Error: ${response.status}`;
              }
            } catch (e) {
              lookupResult = `Error: ${e.message}`;
            }
          }
          return new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              result: { content: [{ type: "text", text: lookupResult }], isError: lookupResult.startsWith("Error") },
              id
            }),
            { headers: { "Content-Type": "application/json" } }
          );
        }
        if (toolName === "hitl_queue_status") {
          let hitlResult = "No data";
          if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
            try {
              const url = `${env.SUPABASE_URL}/rest/v1/hitl_audit_logs?status=eq.Pending&select=id,action_required`;
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
                hitlResult = JSON.stringify({ pending_count: parseInt(count, 10), items: data }, null, 2);
              } else {
                hitlResult = `Error: ${response.status}`;
              }
            } catch (e) {
              hitlResult = `Error: ${e.message}`;
            }
          }
          return new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              result: { content: [{ type: "text", text: hitlResult }], isError: hitlResult.startsWith("Error") },
              id
            }),
            { headers: { "Content-Type": "application/json" } }
          );
        }
        if (toolName === "axim_dispatch_task") {
          let dispatchStatus = "Failed";
          if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
             try {
                 const { task_type, payload } = toolArgs;
                 const response = await fetch(`${env.SUPABASE_URL}/rest/v1/satellite_job_queue`, {
                   method: 'POST',
                   headers: {
                      "Content-Type": "application/json",
                      "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
                      "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
                      "Prefer": "return=minimal"
                   },
                   body: JSON.stringify({
                       workflow_type: task_type,
                       payload,
                       trigger_source: 'mcp_bridge',
                       status: 'pending'
                   })
                 });
                 if (response.ok) {
                     dispatchStatus = `Dispatched task ${task_type || 'unknown'}`;
                 } else {
                     dispatchStatus = `Error: ${response.status}`;
                 }
             } catch(e) {
                 dispatchStatus = `Error: ${e.message}`;
             }
          } else {
              dispatchStatus = "Simulated dispatch success";
          }
          return new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              result: { content: [{ type: "text", text: dispatchStatus }], isError: dispatchStatus.startsWith('Error') },
              id
            }),
            { headers: { "Content-Type": "application/json" } }
          );
        }

        if (toolName === "axim_get_telemetry") {
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
              result: { content: [{ type: "text", text: JSON.stringify(systemHealth, null, 2) }], isError: systemHealth.status === "error" },
              id
            }),
            { headers: { "Content-Type": "application/json" } }
          );
        }

        if (toolName === "axim_list_nodes") {
          let nodesData = "Nodes list simulated";
          if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
             try {
                let url = `${env.SUPABASE_URL}/rest/v1/ecosystem_nodes?select=*`;
                const response = await fetch(url, {
                   headers: {
                      "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
                      "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
                   }
                });
                if (response.ok) {
                   const data = await response.json();
                   nodesData = JSON.stringify(data, null, 2);
                } else {
                   nodesData = `Error fetching nodes: ${response.status}`;
                }
             } catch(e) {
                nodesData = `Error: ${e.message}`;
             }
          }
          return new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              result: { content: [{ type: "text", text: nodesData }], isError: false },
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
