import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.0.0';
import { corsHeaders, getCorsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req.headers.get('origin')) });
  }

  try {
    const { input, user_id, conversation_id, command_type, llm_model, llm_provider, command, response: llmResponse, execution_time_ms } = await req.json();

    if (!input) {
      throw new Error('Missing input text for embedding.');
    }

    let embedding = null;
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');

    if (openAIApiKey) {
      try {
        const response = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openAIApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            input: input,
            model: 'text-embedding-ada-002'
          })
        });

        if (response.ok) {
          const data = await response.json();
          embedding = data.data[0].embedding;
        } else {
          console.warn(`OpenAI API Error: ${response.status} ${await response.text()}`);
        }
      } catch (embError) {
        console.warn('Embedding generation failed, gracefully degrading:', embError);
      }
    } else {
        console.warn('OPENAI_API_KEY not set, skipping embedding generation');
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') as string,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string
    );

    // Save interaction log to ai_interactions_ax2024
    const insertData: any = {
      command: command || input,
      response: llmResponse || '',
      embedding: embedding
    };
    if (user_id) insertData.user_id = user_id;
    if (conversation_id) insertData.conversation_id = conversation_id;
    if (command_type) insertData.command_type = command_type;
    if (llm_model) insertData.llm_model = llm_model;
    if (llm_provider) insertData.llm_provider = llm_provider;
    if (execution_time_ms) insertData.execution_time_ms = execution_time_ms;

    const { error: insertError } = await supabaseAdmin
      .from('ai_interactions_ax2024')
      .insert(insertData);

    if (insertError) {
      console.error('Failed to log interaction:', insertError);
    }

    return new Response(JSON.stringify({ embedding, logged: !insertError }), {
      headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' },
    });
  }
});
