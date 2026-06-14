import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { corsHeaders } from '../_shared/cors.ts';

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

    let postText = post.text;

    try {
        const networkReq = fetch(post.url, { signal: controller.signal });

        const response = await Promise.race([
            networkReq,
            new Promise((_, reject) => {
               controller.signal.addEventListener('abort', () => reject(new Error('AbortError: Timeout')));
            })
        ]) as Response;

        if (response.ok) {
            postText = await response.text();
        }

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
        const prompt = `Analyze the following social media post text and classify its domain. If it is about politics, the working class, automation dividends, or American Tax Credit, return {"domain": "ellars_political"}. Otherwise, if it is about business, technology, automation, or AXiM Systems, return {"domain": "axim_systems"}. Return ONLY valid JSON.\n\nPost Text: ${postText.substring(0, 5000)}`;

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
            body: JSON.stringify({ input: postText.substring(0, 5000) })
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
            content: postText,
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
        return new Response('ok', { headers: corsHeaders });
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
                 headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (error: any) {
        console.error("Error processing request:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
