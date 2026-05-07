import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { corsHeaders } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

const llmProxyUrl = Deno.env.get("LLM_PROXY_URL") || `${supabaseUrl}/functions/v1/llm-proxy`;

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const authHeader = req.headers.get('Authorization');
        if (!authHeader || authHeader.replace('Bearer ', '') !== supabaseKey) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const feeds = [
            { url: "https://feed.pod.co/rants", context: "James Ellars", type: "ellars_political" },
            { url: "https://feed.pod.co/axim-reports", context: "AXiM Systems", type: "axim_systems" }
        ];

        for (const feed of feeds) {
            console.log(`Polling feed: ${feed.url} (${feed.context})`);
            const response = await fetch(feed.url);
            if (!response.ok) {
                console.error(`Failed to fetch ${feed.url}: ${response.status}`);
                continue;
            }

            const xml = await response.text();

            // Very basic XML parsing to extract items
            const itemRegex = /<item>([\s\S]*?)<\/item>/g;
            let match;

            while ((match = itemRegex.exec(xml)) !== null) {
                const itemXml = match[1];
                const titleMatch = /<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/.exec(itemXml);
                const descMatch = /<description><!\[CDATA\[(.*?)\]\]><\/description>|<description>(.*?)<\/description>/.exec(itemXml);
                const linkMatch = /<link>(.*?)<\/link>/.exec(itemXml);
                const pubDateMatch = /<pubDate>(.*?)<\/pubDate>/.exec(itemXml);
                const guidMatch = /<guid.*?>(.*?)<\/guid>/.exec(itemXml);

                const title = titleMatch ? (titleMatch[1] || titleMatch[2]) : "Unknown Title";
                const description = descMatch ? (descMatch[1] || descMatch[2]) : "";
                const link = linkMatch ? linkMatch[1] : "";
                const pubDate = pubDateMatch ? pubDateMatch[1] : "";
                const guid = guidMatch ? guidMatch[1] : "";

                if (!guid) continue;

                // Check if we already processed this episode
                const { data: existing } = await supabase
                    .from('events_ax2024')
                    .select('id')
                    .eq('type', 'NEW_PODCAST_EPISODE')
                    .eq('data->>guid', guid)
                    .single();

                if (existing) {
                    continue; // Already processed
                }

                console.log(`Found new episode: ${title}`);

                // 1. Process via LLM Proxy
                const prompt = `Analyze the following podcast episode metadata and extract strategic context and key points. Focus on context: ${feed.context}. \nTitle: ${title}\nDescription: ${description}`;

                let extractedContext = "";
                try {
                     const llmRes = await fetch(llmProxyUrl, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${supabaseKey}`
                        },
                        body: JSON.stringify({
                            provider: 'openai',
                            prompt: prompt,
                            options: { temperature: 0.7 }
                        })
                    });
                    if (llmRes.ok) {
                        const llmData = await llmRes.json();
                        extractedContext = llmData.response || llmData.text || llmData.content || "";
                    } else {
                         console.error(`LLM proxy failed: ${llmRes.status}`);
                    }
                } catch (e) {
                     console.error("Error communicating with LLM proxy:", e);
                }

                // 2. Vectorize into ai_memory_banks
                if (extractedContext) {
                    // Generate Embedding (calling our edge function)
                    let embedding = null;
                    try {
                         const embedRes = await fetch(`${supabaseUrl}/functions/v1/generate-embedding`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${supabaseKey}`
                            },
                            body: JSON.stringify({ input: extractedContext })
                        });
                        if (embedRes.ok) {
                             const embedData = await embedRes.json();
                             embedding = embedData.embedding;
                        }
                    } catch (e) {
                         console.error("Error generating embedding:", e);
                    }

                    const { error: memError } = await supabase
                        .from('ai_memory_banks')
                        .insert({
                            content: extractedContext,
                            source_type: 'podcast',
                            metadata: {
                                title,
                                link,
                                pubDate,
                                context: feed.context,
                                domain: feed.type,
                                original_description: description
                            },
                            embedding: embedding
                        });

                    if (memError) {
                        console.error("Failed to insert into ai_memory_banks:", memError);
                    }
                }

                // 3. Emit NEW_PODCAST_EPISODE event
                await supabase.from('events_ax2024').insert({
                    type: 'NEW_PODCAST_EPISODE',
                    source: 'podcast-poller',
                    data: {
                        guid,
                        title,
                        link,
                        context: feed.context,
                        domain: feed.type
                    }
                });
            }
        }

        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
});
