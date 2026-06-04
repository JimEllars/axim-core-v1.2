import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Create a mock fetch to simulate the Deno server
const wpAuthKey = "mock_secret_key";
const onyxBridgeUrl = "https://mock.onyx.bridge/v1/event";
const supabaseKey = "mock_supabase_key";

vi.stubEnv('WP_AUTH_KEY', wpAuthKey);
vi.stubEnv('ONYX_BRIDGE_URL', onyxBridgeUrl);
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', supabaseKey);

async function handleRequest(req) {
    try {
        const payload = await req.json();

        // Validate the wp_auth_key from the headers
        const authHeader = req.headers.get('Authorization');
        const providedKey = authHeader ? authHeader.replace('Bearer ', '') : req.headers.get('wp_auth_key');

        if (!wpAuthKey || providedKey !== wpAuthKey) {
            return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
        }

        // Extract post metadata
        let tags = [];
        if (payload.category_indexes && typeof payload.category_indexes === 'string') {
            tags = tags.concat(payload.category_indexes.split(',').map(tag => tag.trim()).filter(t => t.length > 0));
        } else if (Array.isArray(payload.category_indexes)) {
            tags = tags.concat(payload.category_indexes);
        }

        if (payload.meta_keywords && typeof payload.meta_keywords === 'string') {
            tags = tags.concat(payload.meta_keywords.split(',').map(tag => tag.trim()).filter(t => t.length > 0));
        } else if (Array.isArray(payload.meta_keywords)) {
            tags = tags.concat(payload.meta_keywords);
        }

        // Comma-separated format
        const formattedTags = tags.join(', ');

        let content = payload.raw_content || '';
        if (content) {
            content = content.replace(/\bMake\.com\b|\bMake\b/g, '[Make](https://www.axim.us.com/goto/make)');
            content = content.replace(/\bTeachable\b/g, '[Teachable](https://www.axim.us.com/goto/teachable)');
            content = content.replace(/\bTaja AI\b|\bTaja\b/g, '[Taja AI](https://www.axim.us.com/goto/taja-ai)');
            content = content.replace(/\bClickRank\b/g, '[ClickRank](https://www.axim.us.com/goto/clickrank)');
        }

        // Simulate async fetch
        if (onyxBridgeUrl) {
            globalThis.fetch(onyxBridgeUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${supabaseKey}`
                },
                body: JSON.stringify({
                    event: "post_published_direct",
                    post_id: payload.post_id,
                    slug: payload.slug,
                    status: payload.status,
                    raw_content: content,
                    tags: formattedTags
                })
            }).catch(err => console.error("Failed to route to Onyx bridge:", err));
        }

        return new Response(JSON.stringify({ success: true, message: 'Payload received and routed.' }), { status: 200, headers: { "Content-Type": "application/json" } });
    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
}

describe('ACE WP Callback Tests', () => {
    let originalFetch;

    beforeEach(() => {
        originalFetch = globalThis.fetch;
        globalThis.fetch = vi.fn().mockResolvedValue(new Response('OK', { status: 200 }));
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    it('rejects an invalid wp_auth_key with 401 Unauthorized', async () => {
        const req = new Request('https://mock.example.com/ace-wp-callback', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer wrong_key',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                event: 'post_published_direct'
            })
        });

        const res = await handleRequest(req);
        expect(res.status).toBe(401);
        const data = await res.json();
        expect(data.error).toBe('Unauthorized');
    });

    it('accepts a valid wp_auth_key and parses categorical arrays into a comma-separated string', async () => {
        const req = new Request('https://mock.example.com/ace-wp-callback', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${wpAuthKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                event: 'post_published_direct',
                category_indexes: ['tech', 'marketing'],
                meta_keywords: 'ai tools, workflow',
                raw_content: 'Test content with Make and Teachable.'
            })
        });

        const res = await handleRequest(req);
        expect(res.status).toBe(200);

        expect(globalThis.fetch).toHaveBeenCalledWith(onyxBridgeUrl, expect.objectContaining({
            method: 'POST',
            body: expect.stringContaining('"tags":"tech, marketing, ai tools, workflow"')
        }));
        expect(globalThis.fetch).toHaveBeenCalledWith(onyxBridgeUrl, expect.objectContaining({
            method: 'POST',
            body: expect.stringContaining('[Make](https://www.axim.us.com/goto/make)')
        }));
    });
});
