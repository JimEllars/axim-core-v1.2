import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

serve(async (req) => {
  try {
    const payload = await req.json();

    const wpAuthKey = Deno.env.get('WP_AUTH_KEY');
    // Validate the wp_auth_key
    if (payload.wp_auth_key !== wpAuthKey) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
    }

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

    // Post-Enrichment Automated Link Preservation
    let content = payload.raw_content || '';
    if (content) {
      content = content.replace(/\bMake\.com\b|\bMake\b/g, '[Make](https://www.axim.us.com/goto/make)');
      content = content.replace(/\bTeachable\b/g, '[Teachable](https://www.axim.us.com/goto/teachable)');
      content = content.replace(/\bTaja AI\b|\bTaja\b/g, '[Taja AI](https://www.axim.us.com/goto/taja-ai)');
      content = content.replace(/\bClickRank\b/g, '[ClickRank](https://www.axim.us.com/goto/clickrank)');
    }

    // Process the payload (this part will interface with Onyx)
    return new Response(JSON.stringify({ success: true, tags: formattedTags, enriched_content: content }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { "Content-Type": "application/json" } });
  }
});
