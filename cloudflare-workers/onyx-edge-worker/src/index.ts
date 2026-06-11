export default {
  async fetch(request, env, ctx) {
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


    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    }
    const token = authHeader.split('Bearer ')[1];

    // We still allow the static key, BUT only for non-privileged stuff?
    // Wait, the prompt says:
    // "Ping the Supabase Auth API (/auth/v1/user) to validate the token. If the user's metadata role is not admin or support, immediately throw a 403 Forbidden error and halt execution."

    try {
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
    } catch (err) {
        return new Response("Internal Server Error during auth", { status: 500, headers: corsHeaders });
    }


    try {
      const { prompt, command, context } = await request.json();

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

    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  }
};
