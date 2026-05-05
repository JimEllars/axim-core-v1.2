import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

const WP_API_BASE_URL = "https://wp.axim.us.com/wp-json/wp/v2";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { endpoint, payload } = await req.json();

    if (!endpoint || (endpoint !== '/posts' && endpoint !== '/media')) {
      return new Response(JSON.stringify({ error: "Invalid endpoint" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let url = `${WP_API_BASE_URL}${endpoint}`;

    if (payload && payload.query) {
      // Parse and sanitize query parameters
      const urlParams = new URLSearchParams(payload.query);
      const whitelistedParams = new URLSearchParams();

      const allowedKeys = ['slug', 'per_page', 'page', '_embed', 'include'];

      for (const key of allowedKeys) {
        if (urlParams.has(key)) {
          whitelistedParams.append(key, urlParams.get(key)!);
        }
      }

      const queryString = whitelistedParams.toString();
      if (queryString) {
        url += `?${queryString}`;
      }
    }

    const wpResponse = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!wpResponse.ok) {
      throw new Error(`WordPress API responded with status: ${wpResponse.status}`);
    }

    const data = await wpResponse.json();

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in wordpress-proxy:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
