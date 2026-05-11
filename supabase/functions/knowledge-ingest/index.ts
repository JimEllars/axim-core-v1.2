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

        const payload = await req.json();
        let { title, text, source_type = 'text', file_path, category = null, partner = null } = payload;

        // If file_path is provided (from bucket upload), fetch the content first
        if (file_path && source_type === 'storage') {
            const { data: fileData, error: downloadError } = await supabaseAdmin.storage
                .from('executive_knowledge')
                .download(file_path);

            if (downloadError) {
                throw new Error(`Failed to download file from storage: ${downloadError.message}`);
            }

            // Assume text for now, could be enhanced with PDF parser
            text = await fileData.text();
        }

        if (!title || !text) {
            return new Response(JSON.stringify({ error: 'Title and text (or file content) are required.' }), {
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

            if (partner) {
                // Insert into ai_memory_banks for Affiliate Partner Context
                const { error: memError } = await supabaseAdmin
                    .from('ai_memory_banks')
                    .insert({
                        content: chunk,
                        source_type: source_type,
                        metadata: {
                            type: "affiliate_knowledge",
                            partner: partner,
                            title: title,
                            category: category
                        },
                        embedding: embedding,
                        user_id: user?.id
                    });

                if (memError) {
                    console.error("Failed to insert chunk into ai_memory_banks:", memError);
                } else {
                    results.push({ chunk_length: chunk.length, status: 'success' });
                }
            } else {
                // Insert into executive_knowledge_base
                const { error: insertError } = await supabaseAdmin
                    .from('executive_knowledge_base')
                    .insert({
                        title,
                        content_chunk: chunk,
                        embedding,
                        source_type,
                        category
                    });

                if (insertError) {
                    console.error("Failed to insert chunk into knowledge base:", insertError);
                } else {
                    results.push({ chunk_length: chunk.length, status: 'success' });
                }
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
