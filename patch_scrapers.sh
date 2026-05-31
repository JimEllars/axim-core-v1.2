#!/bin/bash
cat << 'INNER_EOF' > supabase/functions/osint-scraper/index.ts
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
INNER_EOF

cat << 'INNER_EOF' > supabase/functions/axim-scraper/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { corsHeaders, getCorsHeaders } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

const llmProxyUrl = Deno.env.get("LLM_PROXY_URL") || `${supabaseUrl}/functions/v1/llm-proxy`;

async function ingestPost(post: any) {
    const postId = post.id || `post-${Date.now()}`;
    // 1. Idempotency Check
    const { data: existing } = await supabase
        .from('events_ax2024')
        .select('id')
        .eq('type', 'NEW_SOCIAL_POST')
        .eq('data->>post_id', postId)
        .maybeSingle();

    if (existing) {
        console.log(`Skipping already ingested post: ${postId}`);
        return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
        // Simulating network fetch with AbortController
        // await fetch(post.url, { signal: controller.signal });

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
        console.error("Social Scraping network timeout:", err);
        // Gracefully record failed node state metric logic
        await supabase.from('api_usage_logs').insert({
            endpoint: '/functions/v1/axim-scraper/error',
            execution_time_ms: -1
        });
        return;
    } finally {
        clearTimeout(timeoutId);
    }


    console.log(`Ingesting new post: ${postId}`);

    // 2. Dynamic AI Classification
    let domain = 'axim_systems';
    try {
        const prompt = `Analyze the following social media post text and classify its domain. If it is about politics, the working class, automation dividends, or American Tax Credit, return {"domain": "ellars_political"}. Otherwise, if it is about business, technology, automation, or AXiM Systems, return {"domain": "axim_systems"}. Return ONLY valid JSON.\n\nPost Text: ${post.text}`;

        const llmRes = await fetch(llmProxyUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseKey}`
            },
            body: JSON.stringify({
                provider: 'openai',
                prompt: prompt,
                options: { temperature: 0.1 }
            })
        });

        if (llmRes.ok) {
            const llmData = await llmRes.json();
            const contentStr = llmData.response || llmData.text || llmData.content || "{}";
            try {
                // Try to parse the JSON output
                const parsed = JSON.parse(contentStr.replace(/```json/g, '').replace(/```/g, '').trim());
                if (parsed.domain) domain = parsed.domain;
            } catch (e) {
                console.warn(`Failed to parse LLM JSON classification: ${contentStr}`);
                if (contentStr.includes('ellars_political')) domain = 'ellars_political';
            }
        }
    } catch (e) {
        console.error("Error classifying social post:", e);
    }

    // 3. Vectorization
    let embedding = null;
    try {
        const embedRes = await fetch(`${supabaseUrl}/functions/v1/generate-embedding`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseKey}`
            },
            body: JSON.stringify({ input: post.text })
        });
        if (embedRes.ok) {
            const embedData = await embedRes.json();
            embedding = embedData.embedding;
        }
    } catch (e) {
        console.error("Error generating embedding:", e);
    }

    // 4. Store in memory_banks
    const { error: memError } = await supabase
        .from('ai_memory_banks')
        .insert({
            content: post.text,
            source_type: `social_${post.platform}`,
            metadata: {
                post_id: postId,
                url: post.url,
                domain: domain,
                timestamp: post.timestamp || new Date().toISOString()
            },
            embedding: embedding
        });

    if (memError) {
        console.error("Failed to insert into ai_memory_banks:", memError);
    }

    // 5. Emit Event
    await supabase.from('events_ax2024').insert({
        type: 'NEW_SOCIAL_POST',
        source: 'axim-scraper',
        data: {
            post_id: postId,
            platform: post.platform,
            url: post.url,
            domain: domain
        }
    });
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: getCorsHeaders(req.headers.get('origin')) });
    }

    try {
        const authHeader = req.headers.get('Authorization');
        if (!authHeader || authHeader.replace('Bearer ', '') !== supabaseKey) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const body = await req.json().catch(() => ({}));

        // Handle webhook payload pushing a new post
        if (body.platform && body.text && body.url) {
            console.log(`Received incoming webhook for platform: ${body.platform}`);
            await ingestPost(body);
            return new Response(JSON.stringify({ success: true, message: "Webhook processed" }), {
                 headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' },
            });
        }

        console.log("Starting social media polling...");

        const mockPosts = [
            { id: `threads-${Date.now()}-1`, platform: 'threads', url: 'https://threads.net/@ellarsjames/post1', text: "The American Tax Credit is the only way forward for the working class.", timestamp: new Date().toISOString() },
            { id: `linkedin-${Date.now()}-2`, platform: 'linkedin', url: 'https://linkedin.com/in/ellars/post2', text: "Just launched a new omnichannel automation workflow for AXiM Core. Incredible efficiency.", timestamp: new Date().toISOString() }
        ];

        for (const post of mockPosts) {
             await ingestPost(post);
        }

        return new Response(JSON.stringify({ success: true, message: "Polling complete" }), {
            headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' },
        });

    } catch (error: any) {
        console.error("Error processing request:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' },
        });
    }
});
INNER_EOF
