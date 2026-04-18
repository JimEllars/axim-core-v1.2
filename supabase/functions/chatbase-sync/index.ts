import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.0.0';

serve(async (req) => {
  // Expect a scheduled invocation (e.g., via cron) or an authenticated webhook
  const authHeader = req.headers.get('Authorization');
  if (authHeader !== `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    // 1. Fetch chat logs from Chatbase API (mocking the real API request here)
    const chatbaseApiKey = Deno.env.get('CHATBASE_API_KEY');
    const chatbaseBotId = Deno.env.get('CHATBASE_BOT_ID');

    if (!chatbaseApiKey || !chatbaseBotId) {
      console.warn('Missing Chatbase API credentials, using mocked data for sync.');
    }

    // Example API logic:
    // const response = await fetch(`https://www.chatbase.co/api/v1/get-conversations?botId=${chatbaseBotId}`, {
    //   headers: { Authorization: `Bearer ${chatbaseApiKey}` }
    // });
    // const logs = await response.json();

    const logs = [
      { id: '1', text: 'User: How do I reset my password? Bot: You can go to settings.' },
      { id: '2', text: 'User: The NDA generator keeps failing on step 2. Bot: Let me help.' }
    ];

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 2. Convert logs into vector embeddings and store in memory bank
    for (const log of logs) {
      // Generate embedding using the internal generate-embedding function (or mock)
      const embeddingReq = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/generate-embedding`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ input: log.text })
      });

      let embedding;
      if (embeddingReq.ok) {
        const result = await embeddingReq.json();
        embedding = result.embedding;
      } else {
        // Fallback for mock environment
        embedding = Array(1536).fill(0.01);
      }

      // Store in ai_interactions_ax2024 as memory bank (with command_type 'support_log')
      await supabaseAdmin.from('ai_interactions_ax2024').insert({
        prompt: log.text,
        response: 'Logged from Chatbase',
        command_type: 'support_log',
        embedding: embedding,
        metadata: { source: 'chatbase', id: log.id }
      });
    }

    return new Response(JSON.stringify({ success: true, count: logs.length }), {
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
