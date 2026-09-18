import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { lead_id } = await req.json();

    if (!lead_id) {
      throw new Error('Missing lead_id');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Fetch the lead from nexus_leads matching lead_id
    const { data: leadData, error: fetchError } = await supabase
      .from('nexus_leads')
      .select('*')
      .eq('id', lead_id)
      .single();

    if (fetchError || !leadData) {
      throw new Error(`Failed to fetch lead: ${fetchError?.message}`);
    }

    const prompt = `Evaluate this B2B lead based on the following data: ${JSON.stringify(leadData)}. Provide a score from 1-100 and a 1-sentence summary of their potential value. Return strictly as JSON: { "score": 85, "summary": "..." }.`;

    const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';

    // Call the llm-proxy edge function
    const llmProxyUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/llm-proxy`;
    const proxyResponse = await fetch(llmProxyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`, // Pass the JWT token for llm-proxy authentication
      },
      body: JSON.stringify({
        provider: 'openai',
        prompt,
      }),
    });

    if (!proxyResponse.ok) {
        const errorText = await proxyResponse.text();
        throw new Error(`LLM Proxy Error: ${errorText}`);
    }

    const proxyData = await proxyResponse.json();
    const content = proxyData.content;
    let aiScore = 0;
    let aiSummary = '';

    try {
        // Strip markdown backticks if any
        const cleanedContent = content.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsedContent = JSON.parse(cleanedContent);
        aiScore = parsedContent.score || 0;
        aiSummary = parsedContent.summary || '';
    } catch(e) {
        console.error('Error parsing JSON from LLM:', content);
        throw new Error('Failed to parse AI response');
    }

    // Update the nexus_leads row
    const { error: updateError } = await supabase
      .from('nexus_leads')
      .update({
        lead_score: aiScore,
        ai_summary: aiSummary,
      })
      .eq('id', lead_id);

    if (updateError) {
      throw new Error(`Failed to update lead: ${updateError.message}`);
    }

    // Log the event to api_usage_logs
    await supabase.from('api_usage_logs').insert({
      status_code: 200,
      endpoint: '/lead-triage',
      payload: { action: 'ai_lead_triage', lead_id, score: aiScore },
    });

    return new Response(JSON.stringify({ success: true, score: aiScore, summary: aiSummary }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error: any) {
    console.error('Error in lead-triage:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
