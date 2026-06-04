import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

serve(async (req) => {
  try {
    const payload = await req.json();

    const wpAuthKey = Deno.env.get('WP_AUTH_KEY');

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

    // Async route to Onyx bridge
    // In a real implementation this would fetch to the ONYX_BRIDGE_URL
    // We will simulate it by doing it asynchronously
    let content = payload.raw_content || '';
    if (content) {
      content = content.replace(/\bMake\.com\b|\bMake\b/g, '[Make](https://www.axim.us.com/goto/make)');
      content = content.replace(/\bTeachable\b/g, '[Teachable](https://www.axim.us.com/goto/teachable)');
      content = content.replace(/\bTaja AI\b|\bTaja\b/g, '[Taja AI](https://www.axim.us.com/goto/taja-ai)');
      content = content.replace(/\bClickRank\b/g, '[ClickRank](https://www.axim.us.com/goto/clickrank)');
    }

    const onyxBridgeUrl = Deno.env.get('ONYX_BRIDGE_URL');

    // We don't await this so it happens asynchronously
    if (onyxBridgeUrl) {
      fetch(onyxBridgeUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
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
});
