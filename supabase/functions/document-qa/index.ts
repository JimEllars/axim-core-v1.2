import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { logTelemetry } from "../_shared/telemetry.ts";
import { corsHeaders } from '../_shared/cors.ts';

// Helper function to generate SHA-256 hash
async function generateCacheKey(query: string, userId: string = 'anonymous', provider: string = 'claude'): Promise<string> {
    const data = new TextEncoder().encode(`${query}|${userId}|${provider}`);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return `https://axim.us.com/rag-cache/${hashHex}`; // Simulated URL for cache key
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        // Clone request if we need to read body multiple times
        let payload;
        try {
            payload = await req.json();
        } catch (e) {
            return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }

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
        const { query, user_id, provider = 'claude', bypass_cache = false } = payload;

        if (query) {
            const supabaseUrl = Deno.env.get('SUPABASE_URL');
            const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

            // --- CACHING LOGIC ---
            let cache: Cache | null = null;
            let cacheKeyRequest: Request | null = null;

            // Check if caches API is available (it is in Deno/Cloudflare workers)
            if (typeof caches !== 'undefined' && !bypass_cache) {
                try {
                    cache = await caches.open('rag-query-cache');
                    const cacheKeyUrl = await generateCacheKey(query, user_id, provider);
                    cacheKeyRequest = new Request(cacheKeyUrl, { method: 'GET' });

                    const cachedResponse = await cache.match(cacheKeyRequest);

                    if (cachedResponse) {
                        // Return cached response
                        const cachedData = await cachedResponse.json();
                        await logTelemetry('document-qa', 200, { action: 'rag_query_executed', provider, cache: 'HIT' });

                        return new Response(JSON.stringify(cachedData), {
                            status: 200,
                            headers: {
                                ...corsHeaders,
                                "Content-Type": "application/json",
                                "X-AXiM-Cache": "HIT"
                            }
                        });
                    }
                } catch (cacheErr) {
                    console.warn("Cache matching failed:", cacheErr);
                }
            }
            // --- END CACHING LOGIC ---

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

                    contextText = sources.map((s: any, idx: number) => `[Source ${idx + 1}]: ${s.content}`).join("\n\n");
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

                const responseData = {
                    answer: llmData.content,
                    sources,
                    respondingProvider: llmData.respondingProvider
                };

                // --- CACHING LOGIC: SAVE TO CACHE ---
                if (cache && cacheKeyRequest) {
                    try {
                        const responseToCache = new Response(JSON.stringify(responseData), {
                            status: 200,
                            headers: {
                                "Content-Type": "application/json",
                                "Cache-Control": "public, max-age=86400" // 24 hours TTL
                            }
                        });
                        await cache.put(cacheKeyRequest, responseToCache);
                    } catch (cachePutErr) {
                        console.warn("Failed to put in cache:", cachePutErr);
                    }
                }
                // --- END CACHING LOGIC ---

                await logTelemetry('document-qa', 200, { action: 'rag_query_executed', provider, cache: 'MISS' });

                return new Response(JSON.stringify(responseData), {
                    status: 200,
                    headers: {
                        ...corsHeaders,
                        "Content-Type": "application/json",
                        "X-AXiM-Cache": "MISS"
                    }
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
