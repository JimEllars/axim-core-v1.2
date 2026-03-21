import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

import { corsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { input } = await req.json();

    if (!input) {
      throw new Error('Missing input text for embedding.');
    }

    // Call OpenAI API directly since we don't have a dedicated embedding proxy setup yet
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) {
       throw new Error('OPENAI_API_KEY is not set in environment.');
    }

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

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`OpenAI API Error: ${response.status} ${errorBody}`);
    }

    const data = await response.json();
    const embedding = data.data[0].embedding;

    return new Response(JSON.stringify({ embedding }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
