import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const ROUNDUPS_API_KEY = Deno.env.get("ROUNDUPS_API_KEY");
const AXIM_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "authorization, content-type" } });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader || authHeader !== `Bearer ${AXIM_SERVICE_KEY}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }

  try {
    const body = await req.json();
    const { action } = body;

    if (action === "test_connection") {
      if (!ROUNDUPS_API_KEY) {
         return new Response(JSON.stringify({ status: "failed", error: "ROUNDUPS_API_KEY not found" }), { status: 500, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ status: "connected", service: "roundups" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    /* TODO: Enable in next sprint
    if (action === "create_roundup") {
       // logic to create round up via roundups.ai API
    }

    if (action === "fetch_status") {
       // logic to check round up status via roundups.ai API
    }
    */

    return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: { "Content-Type": "application/json" } });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
