import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { getCorsHeaders } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

const llmProxyUrl = Deno.env.get("LLM_PROXY_URL") || `${supabaseUrl}/functions/v1/llm-proxy`;

const TARGET_ENTITIES = [
    "James Ellars",
    "AXiM Systems",
    "American Tax Credit"
];

async function ingestUrl(entity: string, result: any) {
    const { url, title, snippet } = result;

    // 1. Idempotency Check
    const { data: existing } = await supabase
        .from('ai_memory_banks')
        .select('id')
        .eq('source_type', 'osint_web')
        .contains('metadata', { url: url })
        .maybeSingle();

    if (existing) {
        console.log(`Skipping already ingested URL: ${url}`);
        return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
        // Simulating network fetch with AbortController
        // await fetch(url, { signal: controller.signal });

        // Let's actually simulate a potential failure for robustness
        const networkReq = new Promise((resolve, reject) => {
             // Mock success unless something explicitly fails
             resolve(true);
        });

        await Promise.race([
            networkReq,
            new Promise((_, reject) => {
               controller.signal.addEventListener('abort', () => reject(new Error('AbortError: Timeout')));
            })
        ]);

    } catch(err) {
        console.error("OSINT Scraping network timeout:", err);
        // Gracefully record failed node state metric logic
        await supabase.from('api_usage_logs').insert({
            endpoint: '/functions/v1/osint-scraper/error',
            execution_time_ms: -1
        });
        return;
    } finally {
        clearTimeout(timeoutId);
    }


    console.log(`Ingesting new URL: ${url} for entity: ${entity}`);

    // Simulate extracting text content from URL
    const extractedText = `${title}\n\n${snippet}\n\n[Full article content simulated...]`;

    // Summarize context via llm-proxy
    let summarizedText = extractedText;
    try {
        const prompt = `Summarize the following text related to ${entity}:\n\n${extractedText}`;
        const llmRes = await fetch(llmProxyUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseKey}`
            },
            body: JSON.stringify({
                provider: 'openai',
                prompt: prompt,
                options: { temperature: 0.3 }
            })
        });

        if (llmRes.ok) {
            const llmData = await llmRes.json();
            summarizedText = llmData.response || llmData.text || llmData.content || summarizedText;
        }
    } catch (e) {
        console.error("Error summarizing text:", e);
    }

    // Vectorization
    let embedding = null;
    try {
        const embedRes = await fetch(`${supabaseUrl}/functions/v1/generate-embedding`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseKey}`
            },
            body: JSON.stringify({ input: summarizedText })
        });
        if (embedRes.ok) {
            const embedData = await embedRes.json();
            embedding = embedData.embedding;
        }
    } catch (e) {
        console.error("Error generating embedding:", e);
    }

    // Store in ai_memory_banks
    const { error: memError } = await supabase
        .from('ai_memory_banks')
        .insert({
            content: summarizedText,
            source_type: `osint_web`,
            metadata: {
                url: url,
                entity: entity,
                source: "osint_web"
            },
            embedding: embedding
        });

    if (memError) {
        console.error("Failed to insert into ai_memory_banks:", memError);
    }
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: getCorsHeaders(req.headers.get('origin')) });
    }

    try {
        console.log("Starting OSINT Scraper polling...");

        for (const entity of TARGET_ENTITIES) {
             // Simulate search results
             const mockResults = [
                 {
                     url: `https://news.example.com/article-${Date.now()}-${entity.replace(/\s+/g, '-').toLowerCase()}`,
                     title: `Recent news about ${entity}`,
                     snippet: `There has been a recent development concerning ${entity}.`
                 }
             ];

             for (const result of mockResults) {
                 await ingestUrl(entity, result);
             }
        }

        return new Response(JSON.stringify({ success: true, message: "OSINT Scrape complete" }), {
            headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' },
        });

    } catch (error: any) {
        console.error("Error in OSINT Scraper:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' },
        });
    }
});
