import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.0.0';
import { getCorsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req.headers.get('origin')) });
  }

  try {
    const authHeader = req.headers.get('X-Axim-Internal-Service-Key');
    const expectedKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!authHeader || authHeader !== expectedKey) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' }
      });
    }

    const { query, threshold = 0.78, limit = 5, user_id } = await req.json();

    if (!query) {
      return new Response(JSON.stringify({ error: 'Missing query string.' }), {
        status: 400,
        headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' }
      });
    }

    let embedding = null;
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');

    if (!openAIApiKey) {
      throw new Error('OPENAI_API_KEY not configured.');
    }

    const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        input: query,
        model: 'text-embedding-ada-002'
      })
    });

    if (!embeddingResponse.ok) {
        throw new Error(`OpenAI API Error: ${embeddingResponse.status} ${await embeddingResponse.text()}`);
    }

    const embeddingData = await embeddingResponse.json();
    embedding = embeddingData.data[0].embedding;

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') as string,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string
    );

    const { data: matchData, error: matchError } = await supabaseAdmin.rpc('match_ai_interactions', {
      query_embedding: embedding,
      match_threshold: threshold,
      match_count: limit,
      p_user_id: user_id || null
    });

    if (matchError) {
      throw matchError;
    }

    return new Response(JSON.stringify({ results: matchData || [] }), {
      headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' },
    });
  }
});
