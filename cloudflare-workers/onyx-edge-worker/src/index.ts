interface Env {
  VITE_SUPABASE_URL: string;
  VITE_SUPABASE_ANON_KEY: string;
  ANTHROPIC_API_KEY: string;
  AI: any;
}

const windowCache = new Map<string, number[]>();

export default {
  async fetch(request: Request, env: Env, ctx: any) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (request.method === "OPTIONS") {
      return new Response("OK", { headers: corsHeaders });
    }

    if (request.method !== "POST") {
       return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
    }

    try {
      const { prompt, command, context, nodeScope } = await request.json() as any;

      const payloadString = prompt || command;

      // Handle async embedding generation
      if (payloadString) {
        ctx.waitUntil((async () => {
          try {
            const aiResponse = await env.AI.run("@cf/baai/bge-base-en-v1.5", {
              text: [payloadString]
            });
            const embedding = aiResponse.data[0];

            const supabaseUrl = env.VITE_SUPABASE_URL || 'https://pvbcdndqjguzqeafhwhw.supabase.co';
            const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY;

            await fetch(`${supabaseUrl}/rest/v1/ai_interactions_ax2024`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${env.VITE_SUPABASE_ANON_KEY}`, // Using anon key for this context if needed, or service_role
                'apikey': supabaseAnonKey,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
              },
              body: JSON.stringify({
                command: payloadString,
                embedding: embedding,
                command_type: 'edge_embedding'
              })
            });
          } catch (e) {
            console.error("Async embedding failed", e);
          }
        })());
      }

      // Task 3: Edge Telemetry Sliding-Window Filter
      if (nodeScope) {
        const now = Date.now();
        const windowTime = 1000; // 1 second window

        // Add an optimized low-overhead cache check
        let timestamps = windowCache.get(nodeScope) || [];

        // Safety wrap for state cache retrieval
        try {
          timestamps = timestamps.filter(time => now - time < windowTime);
        } catch (cacheErr) {
          timestamps = []; // Safe fallback
          const faultPayload = [{ type: 'kv_write_fault', message: 'Failed to read from cache' }];
          console.error(JSON.stringify(faultPayload));
        }

        if (timestamps.length >= 5) { // Threshold: 5 requests per second
          timestamps.push(now); // Count deflected burst

          try {
             windowCache.set(nodeScope, timestamps);
          } catch (cacheErr) {
            const faultPayload = [{ type: 'kv_write_fault', message: 'Failed to write to cache' }];
            console.error(JSON.stringify(faultPayload));
          }

          return new Response(JSON.stringify({ error: "Rate limit exceeded for this node scope" }), {
            status: 429,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
              "X-AXiM-Edge-Throttled": timestamps.length.toString()
            }
          });
        }

        timestamps.push(now);
        try {
          windowCache.set(nodeScope, timestamps);
        } catch (cacheErr) {
          const faultPayload = [{ type: 'kv_write_fault', message: 'Failed to write to cache' }];
          console.error(JSON.stringify(faultPayload));
        }
      }

      const authHeader = request.headers.get("Authorization");
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return new Response("Unauthorized", { status: 401, headers: corsHeaders });
      }
      const token = authHeader.split('Bearer ')[1];

      const supabaseUrl = env.VITE_SUPABASE_URL || 'https://pvbcdndqjguzqeafhwhw.supabase.co';
      const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY;
      let userRes;
      try {
        userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'apikey': supabaseAnonKey
            }
        });
      } catch (authErr) {
         // Add standard safe check fallbacks to verify the worker safely handles instances where telemetry endpoints return non-200 responses
         const faultPayload = [{ type: 'enrichment_fault', message: 'Authentication service unavailable' }];
         console.error(JSON.stringify(faultPayload));
         return new Response(JSON.stringify({ error: "Authentication service unavailable", telemetry: faultPayload }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (!userRes || !userRes.ok) {
          return new Response("Unauthorized - Invalid Token", { status: 403, headers: corsHeaders });
      }

      const userData = await userRes.json();
      const role = userData.app_metadata?.role;

      if (role !== 'admin' && role !== 'support') {
          return new Response("Forbidden - Insufficient Privileges", { status: 403, headers: corsHeaders });
      }

      const onyxSystemPrompt = `You are Onyx mk3, the advanced AI orchestrator for AXiM Core.
Analyze the following command and available system context. Execute the task efficiently.
Context: ${JSON.stringify(context || {})}`;

      const claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: "claude-3-haiku-20240307",
          max_tokens: 1024,
          system: onyxSystemPrompt,
          messages: [{ role: "user", content: payloadString }]
        })
      });

      if (!claudeResponse.ok) {
        const errorText = await claudeResponse.text();
        const faultPayload = [{ type: 'enrichment_fault', message: `Anthropic API error: ${claudeResponse.status} ${errorText}` }];
        console.error(JSON.stringify(faultPayload));
        return new Response(JSON.stringify({ error: `Anthropic API error: ${claudeResponse.status} ${errorText}`, telemetry: faultPayload }), {
          status: claudeResponse.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const llmData = await claudeResponse.json();

      return new Response(JSON.stringify({
        status: "success",
        content: llmData.content[0].text,
        response: llmData.content[0].text,
        timestamp: new Date().toISOString()
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    } catch (e: any) {
      const faultPayload = [{ type: 'enrichment_fault', message: e.message }];
      console.error(JSON.stringify(faultPayload));
      return new Response(JSON.stringify({ error: e.message, telemetry: faultPayload }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  }
};
