import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") as string;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || authHeader !== `Bearer ${Deno.env.get("AXIM_ONYX_SECRET")}`) {
      // Allow fallback to standard supabase auth if service role isn't used directly for testing
      const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(authHeader?.replace('Bearer ', '') || '');
      if (authError || !user) {
          // If neither a valid secret nor a valid user token is provided
          return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    const { command, context, ticket_id } = await req.json();

    if (!command) {
        return new Response(JSON.stringify({ error: "Command required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 1. Generate an embedding for the command to search the knowledge base
    const embeddingResponse = await fetch(`${SUPABASE_URL}/functions/v1/generate-embedding`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ text: command })
    });

    if (!embeddingResponse.ok) {
        throw new Error("Failed to generate embedding");
    }

    const { embedding } = await embeddingResponse.json();

    // 2. Perform Vector Search (Limit to top 3)
    const { data: matchedNodes, error: matchError } = await supabaseAdmin.rpc('match_ai_interactions', {
      query_embedding: embedding,
      match_threshold: 0.75, // 75% similarity threshold
      match_count: 3
    });

    if (matchError) {
      throw new Error(`Vector search failed: ${matchError.message}`);
    }

    // 3. Evaluate matching score
    let responseText = "";
    if (!matchedNodes || matchedNodes.length === 0) {
        // High confidence match not found (< 75% or no matches)
        // Skip AI contextual synthesis and instantly mark the ticket as Open
        if (ticket_id) {
             await supabaseAdmin
                .from('support_tickets')
                .update({ status: 'Open', resolution_notes: 'Insufficient confidence for AI deflection. Escalated to human queue.' })
                .eq('id', ticket_id);
        }
        responseText = "No high-confidence match found. The issue has been routed to an engineer for manual review.";

        return new Response(JSON.stringify({
            status: "escalated",
            response: responseText,
            confidence_matched: false
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    } else {
        // Build contextual response based on top 3 nodes
        const contextStr = matchedNodes.map(n => n.response).join("\n\n");

        // Simulating LLM Call for formatting the answer (Replace with actual Anthropic/OpenAI call in production)
        responseText = `Based on our documentation, here is the proposed solution:\n\n${contextStr}`;

        // If a ticket is provided, mark it as pending user verification
        if (ticket_id) {
             await supabaseAdmin
                .from('support_tickets')
                .update({ status: 'pending_user_verification', ai_response: responseText })
                .eq('id', ticket_id);
        }

        return new Response(JSON.stringify({
            status: "success",
            response: responseText,
            confidence_matched: true,
            sources: matchedNodes.length
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
