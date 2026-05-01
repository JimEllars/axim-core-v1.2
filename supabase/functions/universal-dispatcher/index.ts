import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") as string;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get(
  "SUPABASE_SERVICE_ROLE_KEY",
) as string;
const AXIM_SERVICE_KEY =
  (Deno.env.get("AXIM_SERVICE_KEY") as string) ||
  (Deno.env.get("AXIM_INTERNAL_SERVICE_KEY") as string) ||
  "fallback_internal_key";

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const HIGH_STAKES_ACTIONS = [
  "trigger_marketing_workflow",
  "publish_article",
  "mass_email",
  "quarantine_app"
];

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const internalKeyHeader = req.headers.get("X-Axim-Internal-Service-Key") || req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!internalKeyHeader || (internalKeyHeader !== AXIM_SERVICE_KEY && internalKeyHeader !== SUPABASE_SERVICE_ROLE_KEY)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action_type, payload } = body;

    if (!action_type || !payload) {
      return new Response(
        JSON.stringify({
          error: "Missing required fields: action_type or payload",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const isHighStakes = HIGH_STAKES_ACTIONS.includes(action_type);

    if (isHighStakes) {
      console.log(`[Dispatcher] Routing high-stakes action '${action_type}' to HITL Approval Queue.`);

      // Get an admin ID for the audit log
      const { data: users, error: userError } = await supabaseAdmin.auth.admin.listUsers();
      // Assuming first user or a dummy user if none available
      let adminId = users?.users?.[0]?.id;

      // We will serialize payload in the action or tool_called field since hitl_audit_logs lacks a payload col
      const { error: hitlError } = await supabaseAdmin.from("hitl_audit_logs").insert({
        admin_id: adminId || "00000000-0000-0000-0000-000000000000",
        action: action_type,
        tool_called: JSON.stringify(payload).substring(0, 500), // store payload representation in tool_called temporarily
        status: 'pending'
      });

      if (hitlError) throw hitlError;

      return new Response(
        JSON.stringify({
          success: true,
          message: `Action '${action_type}' is high-stakes. Routed to HITL Approval Queue.`,
          status: 'pending'
        }),
        {
          status: 202,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    } else {
      console.log(`[Dispatcher] Routing low-stakes action '${action_type}' to satellite_job_queue.`);

      const { error: jobError } = await supabaseAdmin.from("satellite_job_queue").insert({
        app_id: "universal-dispatcher",
        payload: { action_type, payload },
        status: 'pending',
        task_type: action_type
      });

      if (jobError) throw jobError;

      return new Response(
        JSON.stringify({
          success: true,
          message: `Action '${action_type}' is low-stakes. Inserted into satellite_job_queue.`,
          status: 'queued'
        }),
        {
          status: 202,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
  } catch (error: any) {
    console.error("Universal Dispatcher Error:", error);

    await supabaseAdmin.from("telemetry_logs").insert({
      event: "integration_failure",
      app_type: "universal-dispatcher",
      status_code: 500,
      timestamp: new Date().toISOString(),
      details: { error: error.message },
    });

    return new Response(
      JSON.stringify({
        error: "Internal Server Error",
        message: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
