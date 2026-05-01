import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.0.0';

const CHATBASE_AGENTS = {
  CEO: 'fViIyS2-64jXMyakjf70T',
  CTO: 'CgplD95DZW5tnXRPEGV2A',
  CFO: 'NHjryFStm6hn2kg6q7KgN',
  COO: '7biTg1Hu6DMWXUpTWfCLu',
  Legal: 'ioJLtMqvhqx69Mokhad64',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } });
  }

  const authHeader = req.headers.get('Authorization');
  if (authHeader !== `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    const payload = await req.json();
    const { agent, query, contextUpdate } = payload;

    if (!agent || !CHATBASE_AGENTS[agent]) {
       return new Response(JSON.stringify({ error: 'Valid agent ID/name is required.' }), { status: 400 });
    }

    const agentId = CHATBASE_AGENTS[agent];
    const chatbaseApiKey = Deno.env.get('CHATBASE_API_KEY');
    if (!chatbaseApiKey) {
        return new Response(JSON.stringify({ error: 'Chatbase API key is not configured.' }), { status: 500 });
    }

    let messageToSend = query;
    if (contextUpdate) {
        messageToSend = `[SYSTEM UPDATE: Please absorb this new context for our strategy] ${contextUpdate}\n\n[QUERY] ${query || 'Acknowledge this update.'}`;
    }

    if (!messageToSend) {
        return new Response(JSON.stringify({ error: 'Either query or contextUpdate must be provided.' }), { status: 400 });
    }

    // Call Chatbase API v2
    const chatbaseResponse = await fetch(`https://www.chatbase.co/api/v2/agents/${agentId}/chat`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${chatbaseApiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            message: messageToSend,
            stream: false
        })
    });

    if (!chatbaseResponse.ok) {
        const errorData = await chatbaseResponse.json();
        throw new Error(`Chatbase API error: ${JSON.stringify(errorData)}`);
    }

    const responseData = await chatbaseResponse.json();
    const assistantMessage = responseData.data.parts.find(p => p.type === 'text')?.text || "No text response";

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Vectorize the interaction to store in memory bank
    const interactionText = `User: ${messageToSend}\nAgent ${agent}: ${assistantMessage}`;
    const embeddingReq = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/generate-embedding`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ input: interactionText })
    });

    let embedding = Array(1536).fill(0.01);
    if (embeddingReq.ok) {
      const result = await embeddingReq.json();
      if (result.embedding) {
          embedding = result.embedding;
      }
    }

    await supabaseAdmin.from('ai_interactions_ax2024').insert({
      prompt: messageToSend,
      response: assistantMessage,
      command_type: 'c_suite_sync',
      embedding: embedding,
      metadata: { source: 'chatbase_v2', agent: agent, agentId: agentId, chatbaseMessageId: responseData.data.id }
    });

    return new Response(JSON.stringify({ success: true, agent: agent, query: messageToSend, response: assistantMessage }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Chatbase sync error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
