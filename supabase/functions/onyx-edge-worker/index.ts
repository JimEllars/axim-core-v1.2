import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") as string;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export async function handleLeadIngress(req: Request) {
  const CF_ACCOUNT_ID = Deno.env.get("CF_ACCOUNT_ID");
  const CF_API_TOKEN = Deno.env.get("CF_API_TOKEN");

  const payload = await req.json();
  const { company_name, job_title, company_size } = payload;

  let enrichmentData = { edge_score: null, reason: null };

  if (CF_ACCOUNT_ID && CF_API_TOKEN) {
    try {
      const prompt = `Evaluate the following B2B lead and provide a score from 1-100 and a brief reason.
Company Name: ${company_name || 'Unknown'}
Job Title: ${job_title || 'Unknown'}
Company Size: ${company_size || 'Unknown'}

Return ONLY a valid JSON object with 'lead_score' (number) and 'reason' (string) fields. Do not include markdown formatting or backticks.`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const aiResponse = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/@cf/meta/llama-3.1-8b-instruct`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${CF_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [
            { role: "system", content: "You are a B2B lead scoring assistant. You always reply with valid JSON." },
            { role: "user", content: prompt }
          ]
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (aiResponse.ok) {
        const aiData = await aiResponse.json();
        const responseText = aiData.result?.response;

        if (responseText) {
            try {
                // Strip markdown backticks if any
                const cleanedContent = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
                const parsedContent = JSON.parse(cleanedContent);
                if (parsedContent.lead_score !== undefined) {
                    enrichmentData = { edge_score: parsedContent.lead_score, reason: parsedContent.reason };
                }
            } catch(e) {
                console.error("Failed to parse AI response JSON:", responseText);
            }
        }
      } else {
        throw new Error(`Cloudflare AI API Error: ${aiResponse.status} ${aiResponse.statusText}`);
      }
    } catch (error: any) {
      console.error("Edge Lead Scoring Error:", error);
      // Non-blocking telemetry log
      supabaseAdmin.from('telemetry_logs').insert({
        event: 'edge_lead_scoring_failure',
        payload: { error: error.message, company_name }
      }).then(({ error: logError }) => {
          if(logError) console.error("Failed to log telemetry:", logError);
      });
      // Fail open - enrichmentData remains null
    }
  }

  // Forward to lead-triage
  const authHeader = req.headers.get("Authorization") || '';
  const forwardPayload = { ...payload, axim_enrichment_data: enrichmentData };

  const forwardResponse = await fetch(`${SUPABASE_URL}/functions/v1/lead-triage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': authHeader
    },
    body: JSON.stringify(forwardPayload)
  });

  if (!forwardResponse.ok) {
      const errorText = await forwardResponse.text();
      return new Response(JSON.stringify({ error: `Downstream error: ${errorText}` }), { status: forwardResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" }});
  }

  const forwardData = await forwardResponse.json();
  return new Response(JSON.stringify(forwardData), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// Only call serve if we are the main module (not imported for testing)
if (import.meta.main) {
    serve(async (req) => {
      if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
      }

      const url = new URL(req.url);

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

        if (req.method === 'POST' && url.pathname.endsWith('/api/v1/leads/ingress')) {
            return await handleLeadIngress(req);
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
}
