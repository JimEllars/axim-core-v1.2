
interface Env {
  VITE_SUPABASE_URL: string;
  VITE_SUPABASE_ANON_KEY: string;
  ANTHROPIC_API_KEY: string;
}

const windowCache = new Map<string, number[]>();

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
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

      // Task 3: Edge Telemetry Sliding-Window Filter
      if (nodeScope) {
        const now = Date.now();
        const windowTime = 1000; // 1 second window

        let timestamps = windowCache.get(nodeScope) || [];
        timestamps = timestamps.filter(time => now - time < windowTime);

        if (timestamps.length >= 5) { // Threshold: 5 requests per second
          timestamps.push(now); // Count deflected burst
          windowCache.set(nodeScope, timestamps);

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
        windowCache.set(nodeScope, timestamps);
      }

      const authHeader = request.headers.get("Authorization");
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return new Response("Unauthorized", { status: 401, headers: corsHeaders });
      }
      const token = authHeader.split('Bearer ')[1];

      const supabaseUrl = env.VITE_SUPABASE_URL || 'https://pvbcdndqjguzqeafhwhw.supabase.co';
      const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY;
      const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
          headers: {
              'Authorization': `Bearer ${token}`,
              'apikey': supabaseAnonKey
          }
      });

      if (!userRes.ok) {
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
          messages: [{ role: "user", content: prompt || command }]
        })
      });

      if (!claudeResponse.ok) {
        const errorText = await claudeResponse.text();
        return new Response(JSON.stringify({ error: `Anthropic API error: ${claudeResponse.status} ${errorText}` }), {
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
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  }
};
