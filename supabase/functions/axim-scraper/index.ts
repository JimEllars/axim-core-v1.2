import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { corsHeaders, getCorsHeaders } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

const llmProxyUrl = Deno.env.get("LLM_PROXY_URL") || `${supabaseUrl}/functions/v1/llm-proxy`;

// Simulated scraping targets
const TARGETS = [
    { type: 'threads', url: 'https://www.threads.com/@ellarsjames' },
    { type: 'tiktok', url: 'https://www.tiktok.com/@ellars' },
    { type: 'instagram', url: 'https://www.instagram.com/ellarsjames' }
];

async function ingestPost(post: any) {
    // 1. Idempotency Check
    const { data: existing } = await supabase
        .from('events_ax2024')
        .select('id')
        .eq('type', 'NEW_SOCIAL_POST')
        .eq('data->>post_id', post.id)
        .single();

    if (existing) {
        console.log(`Skipping already ingested post: ${post.id}`);
        return;
    }

    console.log(`Ingesting new post: ${post.id}`);

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
                post_id: post.id,
                url: post.url,
                domain: domain,
                timestamp: post.timestamp
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
            post_id: post.id,
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
        // Support direct scraping by URL (legacy) or cron-triggered polling
        const body = await req.json().catch(() => ({}));

        if (body.url) {
             const response = await fetch(body.url);
             if (!response.ok) {
                 throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
             }
             const text = await response.text();
             return new Response(JSON.stringify({ content: text }), {
                 headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' },
             });
        }

        // Authentication for automated polling
        const authHeader = req.headers.get('Authorization');
        if (!authHeader || authHeader.replace('Bearer ', '') !== supabaseKey) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        console.log("Starting social media polling...");

        // In a real scenario, this would use Apify or similar to fetch actual posts.
        // For demonstration/implementation, we simulate fetching recent posts.
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
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' },
        });
    }
});
