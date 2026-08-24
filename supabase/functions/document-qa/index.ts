import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { logTelemetry } from "../_shared/telemetry.ts";
import { corsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const payload = await req.json();

        // Handle existing trace_id logic
        const record = payload.record || payload;
        const traceId = record.trace_id;

        if (traceId && !payload.query) {
            const supabaseUrl = Deno.env.get('SUPABASE_URL');
            const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

            if (!supabaseUrl || !serviceRoleKey) {
                console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.");
                return new Response(JSON.stringify({ error: "Server configuration error" }), {
                    status: 500,
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            }

            const onyxPrompt = `A new document with Trace ID ${traceId} has been vaulted. Fetch it using your vault tool, read the contents, and verify there are no formatting errors, overlapping text, or missing signatures.`;

            // Send POST to onyx-bridge
            const response = await fetch(`${supabaseUrl}/functions/v1/onyx-bridge`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${serviceRoleKey}`
                },
                body: JSON.stringify({ prompt: onyxPrompt })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error("Failed to notify Onyx bridge:", errorText);
                return new Response(JSON.stringify({ error: "Failed to notify Onyx bridge" }), {
                    status: 500,
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            }

            return new Response(JSON.stringify({ message: "QA pipeline triggered successfully", trace_id: traceId }), {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }

        // Handle RAG Query logic
        const { query, user_id, provider = 'claude' } = payload;

        if (query) {
            const supabaseUrl = Deno.env.get('SUPABASE_URL');
            const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

            // 1. Fetch context from memory-retrieval
            let contextText = "";
            let sources = [];
            try {
                const memoryResponse = await fetch(`${supabaseUrl}/functions/v1/memory-retrieval`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Axim-Internal-Service-Key': serviceRoleKey || 'test_internal_key'
                    },
                    body: JSON.stringify({ query, user_id, limit: 3 })
                });

                if (memoryResponse.ok) {
                    const memoryData = await memoryResponse.json();

                    const combinedContext = [
                        ...(memoryData.chat_context || []),
                        ...(memoryData.strategic_context || []),
                        ...(memoryData.executive_knowledge_base || [])
                    ].sort((a, b) => (b.similarity || 0) - (a.similarity || 0)).slice(0, 5);

                    sources = combinedContext.map((c: any) => ({
                         content: c.response || c.content || c.command,
                         similarity: c.similarity
                    }));

                    contextText = sources.map((s: any, idx: number) => `[Source ${idx + 1}]: ${s.content}`).join("\\n\\n");
                }
            } catch (err) {
                console.warn("Failed to fetch memory context", err);
            }

            const systemPrompt = `You are an intelligent assistant for the AXiM ecosystem. Answer the user's query using the following context. If the context does not contain the answer, say so.\n\nContext:\n${contextText}\n\nUser Query: ${query}`;

            // 2. Call llm-proxy
            try {
                const llmResponse = await fetch(`${supabaseUrl}/functions/v1/llm-proxy`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': req.headers.get('Authorization') || `Bearer ${serviceRoleKey}`
                    },
                    body: JSON.stringify({
                        provider,
                        prompt: systemPrompt,
                        options: {
                            model: provider === 'claude' ? 'claude-3-haiku-20240307' : 'gpt-4o-mini',
                            max_tokens: 1024
                        }
                    })
                });

                if (!llmResponse.ok) {
                    throw new Error(`LLM Proxy returned ${llmResponse.status}: ${await llmResponse.text()}`);
                }

                const llmData = await llmResponse.json();

                await logTelemetry('document-qa', 200, { action: 'rag_query_executed', provider });

                return new Response(JSON.stringify({
                    answer: llmData.content,
                    sources,
                    respondingProvider: llmData.respondingProvider
                }), {
                    status: 200,
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });

            } catch (llmError: any) {
                console.error("LLM Proxy upstream failure:", llmError);
                await logTelemetry('document-qa', 502, { action: 'rag_query_failed', error: llmError.message });
                return new Response(JSON.stringify({ error: "Bad Gateway - Upstream AI provider unreachable." }), {
                    status: 502,
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            }
        }

        return new Response(JSON.stringify({ error: "Invalid payload. Provide trace_id or query." }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });

    } catch (error) {
        console.error("Error processing document-qa payload:", error);
        return new Response(JSON.stringify({ error: "Internal server error" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
    }
});
