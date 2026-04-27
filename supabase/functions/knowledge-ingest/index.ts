import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.0.0';
import { getCorsHeaders } from '../_shared/cors.ts';

function chunkText(text: string, maxLen = 1000, overlap = 100): string[] {
    const chunks = [];
    let i = 0;
    while (i < text.length) {
        chunks.push(text.slice(i, i + maxLen));
        i += maxLen - overlap;
    }
    return chunks;
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: getCorsHeaders(req.headers.get('origin')) });
    }

    try {
        const authHeader = req.headers.get('Authorization');
        const isServiceRole = authHeader === `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`;

        let user = null;
        if (!isServiceRole) {
            const supabaseClient = createClient(
                Deno.env.get('SUPABASE_URL') ?? '',
                Deno.env.get('SUPABASE_ANON_KEY') ?? '',
                { global: { headers: { Authorization: authHeader! } } }
            );

            const { data: authData, error: userError } = await supabaseClient.auth.getUser();
            user = authData.user;

            if (userError || !user) {
                return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                    status: 401,
                    headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' },
                });
            }
        }

        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') as string,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string
        );

        const { title, text, source_type = 'text' } = await req.json();

        if (!title || !text) {
            return new Response(JSON.stringify({ error: 'Title and text are required.' }), {
                status: 400,
                headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' }
            });
        }

        const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
        const chunks = chunkText(text);
        const results = [];

        for (const chunk of chunks) {
            let embedding = null;

            if (!openAIApiKey) {
                // Mock embedding
                embedding = new Array(1536).fill(0.01);
            } else {
                const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${openAIApiKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        input: chunk,
                        model: 'text-embedding-ada-002'
                    })
                });

                if (!embeddingResponse.ok) {
                    const err = await embeddingResponse.text();
                    console.error("Embedding API Error:", err);
                    continue; // Skip failed chunk or decide to throw
                }

                const embeddingData = await embeddingResponse.json();
                embedding = embeddingData.data[0].embedding;
            }

            const { error: insertError } = await supabaseAdmin
                .from('executive_knowledge_base')
                .insert({
                    title,
                    content_chunk: chunk,
                    embedding,
                    source_type
                });

            if (insertError) {
                console.error("Failed to insert chunk into knowledge base:", insertError);
            } else {
                results.push({ chunk_length: chunk.length, status: 'success' });
            }
        }

        return new Response(JSON.stringify({ success: true, processed_chunks: results.length }), {
            headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' },
        });

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' },
        });
    }
});
