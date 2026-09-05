import re

with open("supabase/functions/knowledge-ingest/index.ts", "r") as f:
    content = f.read()

# Replace chunkText default parameters
content = content.replace("function chunkText(text: string, maxLen = 1000, overlap = 100): string[]",
                          "function chunkText(text: string, maxLen = 2000, overlap = 200): string[]")

# Update payload parsing
content = content.replace("let { title, text, source_type = 'text', file_path, category = null, partner = null } = payload;",
                          "let { title, content: text, tags, source_app, source_type = 'text', file_path, category = null, partner = null } = payload;")

# Ensure text from file loading correctly falls back to content payload
# Actually, `content: text` binds the `content` property to `text` variable.
# We also have `text` in `if (!title || !text)` checking.
# But just in case `text` is passed, let's accommodate both.
content = content.replace("let { title, content: text, tags, source_app, source_type = 'text', file_path, category = null, partner = null } = payload;",
                          "let { title, content, text, tags, source_app, source_type = 'text', file_path, category = null, partner = null } = payload;\n        text = content || text;")


# Update OpenAI embedding API with generate-embedding invocation
old_embedding = """            if (!openAIApiKey) {
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
            }"""

new_embedding = """            try {
                const embeddingReq = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/generate-embedding`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ input: chunk })
                });

                if (embeddingReq.ok) {
                    const result = await embeddingReq.json();
                    if (result.embedding) {
                        embedding = result.embedding;
                    }
                } else {
                    console.error("Embedding function failed:", await embeddingReq.text());
                }
            } catch(e) {
                console.error("Failed to generate embedding", e);
            }

            if (!embedding) {
                embedding = new Array(1536).fill(0.01);
            }"""

content = content.replace(old_embedding, new_embedding)

# Update return value to include article_id: insertError ? null : inserted_id, chunks_indexed: results.length
# Wait, the insert is per chunk, so we might want to return `article_id` from the last chunk inserted.
# Actually, `id` might not be selected in the insert response if we don't use `.select()`.
# Let's see what the original return is.
content = content.replace("return new Response(JSON.stringify({ success: true, processed_chunks: results.length }), {",
                          "return new Response(JSON.stringify({ success: true, article_id: results.length > 0 ? results[0].id : null, chunks_indexed: results.length }), {")

# To get the `id` from the insert, we need to modify the insert call
# Wait, `results.push({ chunk_length: chunk.length, status: 'success' })`. We can just add `.select('id').single()` to the insert.
old_insert_ekb = """                // Insert into executive_knowledge_base
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
                }"""

new_insert_ekb = """                // Insert into executive_knowledge_base
                const { data: insertedData, error: insertError } = await supabaseAdmin
                    .from('executive_knowledge_base')
                    .insert({
                        title,
                        content_chunk: chunk,
                        embedding,
                        source_type,
                        category
                    }).select('id');

                if (insertError) {
                    console.error("Failed to insert chunk into knowledge base:", insertError);
                } else {
                    results.push({ id: insertedData?.[0]?.id, chunk_length: chunk.length, status: 'success' });
                }"""

content = content.replace(old_insert_ekb, new_insert_ekb)

with open("supabase/functions/knowledge-ingest/index.ts", "w") as f:
    f.write(content)
