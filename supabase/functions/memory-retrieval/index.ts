import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.0.0';
import { corsHeaders } from '../_shared/cors.ts';
import { keysFromEnv, resolveCaller } from '../_shared/edgeAuth.ts';

export const handleRequest = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Authentication.
    //
    // This previously compared against `SUPABASE_SERVICE_ROLE_KEY ||
    // 'test_internal_key'` — a literal fallback that any caller could guess, and
    // which also meant the endpoint was unusable once the real key was set. It
    // accepted no user credentials at all, yet the dashboard called it with a
    // browser-side value and the service callers passed `user_id` straight from
    // the request body. Resolve the caller instead and let the identity decide
    // which tenant is visible.
    const verifyUser = async (token: string): Promise<string | null> => {
      const verified = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: `Bearer ${token}` } } },
      );
      // getUser(token), not getUser(): with no session the client would make no
      // request at all and every valid token would be treated as anonymous.
      const { data, error } = await verified.auth.getUser(token);
      return error || !data?.user ? null : data.user.id;
    };

    const caller = await resolveCaller(req.headers, keysFromEnv(Deno.env), verifyUser);

    if (caller.kind === 'anonymous') {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const body = await req.json();
    const { query, threshold = 0.70, limit = 5 } = body;

    // A user may only ever retrieve their own memories. Only an internal caller
    // may target another tenant (or null, for project-wide recall).
    const user_id = caller.kind === 'internal' ? body.user_id : caller.userId;

    if (!query) {
      return new Response(JSON.stringify({ error: 'Missing query string.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    let embedding = null;
    const cfAccountId = Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
    const cfApiToken = Deno.env.get('CLOUDFLARE_API_TOKEN');
    let usedVectorize = false;
    let vectorizeResults = [];

    // Try Cloudflare Workers AI for embeddings if configured
    if (cfAccountId && cfApiToken) {
        try {
            const aiResponse = await fetch(`https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/ai/run/@cf/baai/bge-base-en-v1.5`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${cfApiToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ text: query })
            });

            if (aiResponse.ok) {
                const aiData = await aiResponse.json();
                if (aiData.result && aiData.result.data && aiData.result.data.length > 0) {
                   embedding = aiData.result.data[0];

                   // Try to query Cloudflare Vectorize if we got an embedding from Workers AI
                   try {
                       const vectorizeResponse = await fetch(`https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/vectorize/indexes/vector-kb/query`, {
                           method: 'POST',
                           headers: {
                               'Authorization': `Bearer ${cfApiToken}`,
                               'Content-Type': 'application/json'
                           },
                           body: JSON.stringify({ vector: embedding, topK: limit, returnMetadata: true })
                       });

                       if (vectorizeResponse.ok) {
                           const vData = await vectorizeResponse.json();
                           // Check if we have good matches
                           if (vData.result && vData.result.matches && vData.result.matches.length > 0 && vData.result.matches[0].score >= threshold) {
                               vectorizeResults = vData.result.matches.map((m: any) => ({
                                   id: m.id,
                                   content: m.metadata?.content || 'Vectorize result',
                                   similarity: m.score
                               }));
                               usedVectorize = true;
                           }
                       }
                   } catch (vErr) {
                       console.warn("Cloudflare Vectorize query failed", vErr);
                   }
                }
            }
        } catch (err) {
            console.warn("Cloudflare Workers AI embedding failed", err);
        }
    }

    // Fallback to OpenAI if Workers AI failed or wasn't configured, or to 1536-dim mock if neither is available
    if (!embedding) {
        const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
        if (!openAIApiKey) {
          // Mock embedding for testing without OPENAI_API_KEY
          embedding = new Array(1536).fill(0.01);
        } else {
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
        }
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') as string,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string
    );

    // Fetch granular chat context
    const { data: chatContext, error: chatError } = await supabaseAdmin.rpc('match_ai_interactions', {
      query_embedding: embedding,
      match_threshold: threshold,
      match_count: limit,
      p_user_id: user_id || null,
      p_offset: 0
    });

    if (chatError) throw chatError;

    // Fetch strategic memory bank context
    const { data: strategicContext, error: stratError } = await supabaseAdmin.rpc('match_memory_banks', {
      query_embedding: embedding,
      match_threshold: threshold,
      match_count: limit
    });

    if (stratError) {
      // If RPC doesn't exist yet, we don't want to crash everything during dev
      console.warn("match_memory_banks failed:", stratError);
    }

    let knowledgeBaseContext: any[] = [];
    const { data: kbData, error: kbError } = await supabaseAdmin.rpc("match_knowledge_base", {
      query_embedding: embedding,
      match_threshold: threshold,
      match_count: limit
    });
    if (kbError) {
      console.warn("match_knowledge_base failed:", kbError);
    } else if (kbData) {
      knowledgeBaseContext = kbData;
    }

    // If Vectorize had good hits, we can prepend or use them
    if (usedVectorize) {
       // Merge vectorize results into knowledge base context, or return immediately if it's a perfect hit > 0.9
       // For this implementation, we prepend them to the executive knowledge base
       knowledgeBaseContext = [...vectorizeResults, ...(knowledgeBaseContext || [])];
    }

    return new Response(JSON.stringify({
      chat_context: chatContext || [],
      strategic_context: strategicContext || [],
      executive_knowledge_base: knowledgeBaseContext || [],
      edge_accelerated: usedVectorize
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
};

if (import.meta.main) {
  serve(handleRequest);
}
