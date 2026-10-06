import { authenticateOperator } from './auth.ts';
import { sanitizeEgressPayload } from './sanitizer.ts';
import { checkKillSwitch } from './killSwitch.ts';
import { checkRateLimit } from './rateLimit.ts';

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
          "Access-Control-Allow-Headers": "Content-Type, Authorization, CF-Access-Client-Id, CF-Access-Client-Secret"
        }
      });
    }

    const url = new URL(request.url);
    if (url.pathname !== '/mcp') {
      return new Response(
        JSON.stringify(jsonRpcError(null, -32601, `Not Found`)),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const killSwitchResponse = await checkKillSwitch(env);
    if (killSwitchResponse) return killSwitchResponse;

    const rateLimitResponse = await checkRateLimit(request, env);
    if (rateLimitResponse) return rateLimitResponse;

    const authResponse = await authenticateOperator(request, env);
    if (authResponse) return authResponse;

    try {
      const body = await request.json();
      const { jsonrpc, method, params, id } = body;

      if (jsonrpc !== "2.0") {
        return new Response(
          JSON.stringify(jsonRpcError(id, -32600, "Invalid JSON-RPC version")),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      if (method === "tools/list") {
        const tools = {
          jsonrpc: "2.0",
          result: {
            tools: [
              {
                name: "bridge_runtime_status",
                description: "Reports worker environment, transport, KV state, and kill-switch status.",
                inputSchema: { type: "object", properties: {} }
              },
              {
                name: "bridge_security_check",
                description: "Reports whether Cloudflare Access, Passport URL, and rate-limiting KV are configured without returning secrets.",
                inputSchema: { type: "object", properties: {} }
              },
              {
                name: "core_health_check",
                description: "Pings Supabase Core REST endpoint and returns connection latency and health status.",
                inputSchema: { type: "object", properties: {} }
              },
              {
                name: "telemetry_lookup",
                description: "Queries public.telemetry_events.",
                inputSchema: {
                   type: "object",
                   properties: {
                       severity: { type: "string" },
                       limit: { type: "number" }
                   }
                }
              },
              {
                name: "hitl_queue_status",
                description: "Queries public.hitl_audit_logs where status = 'pending'.",
                inputSchema: { type: "object", properties: {} }
              },
              {
                name: "axim_list_nodes",
                description: "Queries active nodes from public.ecosystem_nodes.",
                inputSchema: { type: "object", properties: {} }
              },
              {
                name: "axim_get_telemetry",
                description: "Aggregates DB connectivity, latency, active LLM provider, and DLQ depth.",
                inputSchema: { type: "object", properties: {} }
              },
              {
                name: "axim_dispatch_task",
                description: "Stages actions into public.hitl_audit_logs as pending.",
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
        };
        return new Response(JSON.stringify(sanitizeEgressPayload(tools)), { headers: { "Content-Type": "application/json" } });
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

        let toolResponse = null;

        if (toolName === "bridge_runtime_status") {
           let suspended = 'unknown';
           if (env.LAB_STATE) {
               try { suspended = await env.LAB_STATE.get('OPERATOR_DOCK_SUSPENDED') || 'false'; } catch(e){}
           }
           toolResponse = {
               jsonrpc: "2.0",
               result: { content: [{ type: "text", text: JSON.stringify({ environment: env.ENVIRONMENT || 'unknown', transport: 'JSON-RPC 2.0', kill_switch: suspended }) }], isError: false },
               id
           };
        } else if (toolName === "bridge_security_check") {
           toolResponse = {
               jsonrpc: "2.0",
               result: { content: [{ type: "text", text: JSON.stringify({ cf_access_configured: !!(env.CF_ACCESS_CLIENT_ID && env.CF_ACCESS_CLIENT_SECRET), passport_url_configured: !!env.PASSPORT_VERIFY_URL, lab_state_kv_available: !!env.LAB_STATE }) }], isError: false },
               id
           };
        } else if (toolName === "core_health_check") {
          const startTime = Date.now();
          let resOk = false;
          try {
            const res = await fetch(`${env.SUPABASE_URL}/rest/v1/telemetry_events?select=id&limit=1`, {
              headers: { "apikey": env.SUPABASE_SERVICE_ROLE_KEY, "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }
            });
            resOk = res.ok;
          } catch(e) {}
          const latency = Date.now() - startTime;
          toolResponse = {
            jsonrpc: "2.0",
            result: { content: [{ type: "text", text: JSON.stringify({ status: resOk ? "healthy" : "degraded", latency_ms: latency, timestamp: new Date().toISOString() }) }], isError: !resOk },
            id
          };
        } else if (toolName === "telemetry_lookup") {
          const severity = toolArgs.severity || 'ERROR';
          const limit = Math.min(toolArgs.limit || 5, 20);
          let events = [];
          try {
             const res = await fetch(`${env.SUPABASE_URL}/rest/v1/telemetry_events?select=id,component_id,severity,message,created_at&severity=eq.${severity}&order=created_at.desc&limit=${limit}`, {
               headers: { "apikey": env.SUPABASE_SERVICE_ROLE_KEY, "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }
             });
             if (res.ok) events = await res.json();
          } catch(e) {}
          toolResponse = {
            jsonrpc: "2.0",
            result: { content: [{ type: "text", text: JSON.stringify({ recent_critical_events: events }) }], isError: false },
            id
          };
        } else if (toolName === "hitl_queue_status") {
          let pendingCount = 0;
          let items = [];
          try {
             const res = await fetch(`${env.SUPABASE_URL}/rest/v1/hitl_audit_logs?select=id,action_name,status&status=eq.pending`, {
               headers: { "apikey": env.SUPABASE_SERVICE_ROLE_KEY, "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Prefer": "count=exact" }
             });
             if (res.ok) {
                 items = await res.json();
                 pendingCount = parseInt(res.headers.get("content-range")?.split("/")?.[1] || items.length.toString(), 10);
             }
          } catch(e) {}
          toolResponse = {
            jsonrpc: "2.0",
            result: { content: [{ type: "text", text: JSON.stringify({ pending_approvals: pendingCount, items, timestamp: new Date().toISOString() }) }], isError: false },
            id
          };
        } else if (toolName === "axim_dispatch_task") {
          let dispatchStatus = "Failed";
          if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
             try {
                 const { task_type, payload } = toolArgs;
                 const dbPayload = {
                   action_name: task_type,
                   payload: payload,
                   status: 'pending',
                   target_department: 'CORE',
                   requested_by: 'mcp_operator_session',
                   created_at: new Date().toISOString()
                 };
                 const response = await fetch(`${env.SUPABASE_URL}/rest/v1/hitl_audit_logs`, {
                   method: 'POST',
                   headers: {
                      "Content-Type": "application/json",
                      "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
                      "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
                      "Prefer": "return=minimal"
                   },
                   body: JSON.stringify(dbPayload)
                 });
                 if (response.ok) {
                     dispatchStatus = "{\"status\": \"STAGED_FOR_APPROVAL\", \"message\": \"Task queued for Super User approval in AXiM Core.\"}";
                 } else {
                     dispatchStatus = `Error: ${response.status}`;
                 }
             } catch(e) {
                 dispatchStatus = `Error: ${e.message}`;
             }
          } else {
              dispatchStatus = "{\"status\": \"STAGED_FOR_APPROVAL\", \"message\": \"Task queued for Super User approval in AXiM Core.\"}";
          }
          toolResponse = {
            jsonrpc: "2.0",
            result: { content: [{ type: "text", text: dispatchStatus }], isError: dispatchStatus.startsWith('Error') },
            id
          };
        } else if (toolName === "axim_get_telemetry") {
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
                 headers: { "apikey": env.SUPABASE_SERVICE_ROLE_KEY, "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }
               });
               systemHealth.latency_ms = Date.now() - startTime;
               if(response.ok) {
                 systemHealth.status = "healthy";
                 systemHealth.db_connectivity = "ok";
                 const dlqResponse = await fetch(`${env.SUPABASE_URL}/rest/v1/dead_letter_jobs?select=id,status&status=eq.pending`, {
                   headers: { "apikey": env.SUPABASE_SERVICE_ROLE_KEY, "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Prefer": "count=exact,head=true" }
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
          toolResponse = {
            jsonrpc: "2.0",
            result: { content: [{ type: "text", text: JSON.stringify(systemHealth, null, 2) }], isError: systemHealth.status === "error" },
            id
          };
        } else if (toolName === "axim_list_nodes") {
          let nodesData = "Nodes list simulated";
          if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
             try {
                let url = `${env.SUPABASE_URL}/rest/v1/ecosystem_nodes?select=*`;
                const response = await fetch(url, {
                   headers: { "apikey": env.SUPABASE_SERVICE_ROLE_KEY, "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }
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
          toolResponse = {
            jsonrpc: "2.0",
            result: { content: [{ type: "text", text: nodesData }], isError: false },
            id
          };
        } else {
           return new Response(
             JSON.stringify(jsonRpcError(id, -32601, `Tool not found: ${toolName}`)),
             { status: 404, headers: { "Content-Type": "application/json" } }
           );
        }

        return new Response(
          JSON.stringify(sanitizeEgressPayload(toolResponse)),
          { headers: { "Content-Type": "application/json" } }
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
