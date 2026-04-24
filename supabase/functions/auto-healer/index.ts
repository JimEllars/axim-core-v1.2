import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  try {
    const payload = await req.json();
    const record = payload.record;

    if (!record || record.event !== 'uptime_failure') {
      return new Response(JSON.stringify({ message: "Ignored non-failure event" }), { status: 200 });
    }

    const url = record.details?.url || record.details?.target_url || record.details?.endpoint;

    if (!url) {
      console.warn("No URL found in telemetry log details.");
      return new Response(JSON.stringify({ error: "No URL found in payload" }), { status: 400 });
    }

    const prompt = `CRITICAL: Micro-app ${url} is offline. Execute your Cloudflare Cache Purge tool. Then, verify the URL status. If it is still down after 30 seconds, escalate to the Admin.`;

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing Supabase configuration");
    }

    console.log(`[Auto-Healer] Triggering Onyx for ${url}`);

    const onyxResponse = await fetch(`${supabaseUrl}/functions/v1/onyx-bridge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`
      },
      body: JSON.stringify({ prompt })
    });

    if (!onyxResponse.ok) {
      console.error(`[Auto-Healer] Onyx bridge failed: ${onyxResponse.statusText}`);
      return new Response(JSON.stringify({ error: "Failed to trigger Onyx" }), { status: 500 });
    }

    return new Response(JSON.stringify({ success: true, message: `Triggered auto-healer for ${url}` }), { status: 200 });

  } catch (error) {
    console.error(`[Auto-Healer] Error: ${error.message}`);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});
