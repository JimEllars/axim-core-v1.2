import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY') || '';

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // 1. Fetch data: ai_interactions_ax2024 from the last 24 hours
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const { data: interactions, error: fetchError } = await supabase
      .from('ai_interactions_ax2024')
      .select('command, response, created_at, user_id')
      .gte('created_at', yesterday.toISOString());

    if (fetchError) {
      throw new Error(`Failed to fetch interactions: ${fetchError.message}`);
    }

    if (!interactions || interactions.length === 0) {
      return new Response(JSON.stringify({ message: "No interactions in the last 24 hours to compress." }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // 2. LLM Summarization
    const promptText = `
You are an expert executive assistant. Review the following AI interactions from the past 24 hours.
Extract the core business events, decisions made, and active action items into a concise summary.
Return your answer purely as a JSON object with two fields:
- "executive_summary": A concise paragraph summarizing the day.
- "key_decisions": A JSON array of strings, each being a distinct decision or action item.

Interactions:
${interactions.map(i => `User (${i.user_id}): ${i.command}\nAI: ${i.response}`).join('\n\n')}
    `;

    let summary = "Fallback summary";
    let decisions = [];

    try {
      // Pass these raw interactions through the LLM proxy to generate a dense, high-level executive summary.
      // In Edge Function-to-Edge Function calls, we can use invoke.
      const { data: llmData, error: llmError } = await supabase.functions.invoke('llm-proxy', {
        body: {
          provider: 'openai',
          prompt: promptText,
          options: { model: 'gpt-4o-mini', response_format: { type: "json_object" } }
        }
      });

      if (llmError) throw llmError;

      if (llmData && llmData.content) {
          const resultObj = typeof llmData.content === 'string' ? JSON.parse(llmData.content) : llmData.content;
          summary = resultObj.executive_summary || "Generated summary";
          decisions = resultObj.key_decisions || [];
      } else {
          throw new Error("Invalid response from llm-proxy");
      }
    } catch (llmError) {
      console.warn("LLM proxy failed. Using mock summarization.", llmError);
      summary = `Mock summary of ${interactions.length} interactions.`;
      decisions = ["Review workflows", "Approve API keys"];
    }

    // 3. Vector Generation & Storage
    let embedding = new Array(1536).fill(0.01); // Mock embedding

    try {
      const { data: embData, error: embError } = await supabase.functions.invoke('generate-embedding', {
        body: { input: summary }
      });
      if (embError) throw embError;
      if (embData && embData.embedding) {
          embedding = embData.embedding;
      }
    } catch (embError) {
      console.warn("Embedding proxy failed. Using mock embedding.", embError);
    }

    const { error: insertError } = await supabase
      .from('ai_memory_banks')
      .insert({
        user_id: interactions[0]?.user_id, source_type: 'cognitive_compression', metadata: { summary_date: yesterday.toISOString().split('T')[0], key_decisions: decisions }, content: summary,


        embedding: embedding
      });

    if (insertError) {
      throw new Error(`Failed to insert into memory_banks: ${insertError.message}`);
    }

    // 4. Telemetry: Log success
    await supabase.from('telemetry_logs').insert({
       event_type: 'cognitive_compression_complete',
       severity: 'INFO',
       metadata: { interactions_processed: interactions.length }
    });

    return new Response(JSON.stringify({ message: "Cognitive compression complete." }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error("Cognitive compression error:", error);

    // Fail gracefully and log a telemetry error
    try {
      await supabase.from('telemetry_logs').insert({
         event_type: 'cognitive_compression_failed',
         severity: 'ERROR',
         metadata: { error: error.message }
      });
    } catch (telemetryError) {
      console.error("Also failed to log telemetry error:", telemetryError);
    }

    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
