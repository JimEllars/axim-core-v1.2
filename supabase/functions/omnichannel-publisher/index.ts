import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.0.0';
import { corsHeaders, getCorsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req.headers.get('origin')) });
  }

  try {
    const authHeader = req.headers.get('X-Axim-Internal-Service-Key');
    const expectedKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || 'test_internal_key';

    if (!authHeader || authHeader !== expectedKey) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' }
      });
    }

    const { content, title, target_channels, metadata } = await req.json();

    if (!content || !target_channels || !Array.isArray(target_channels)) {
      return new Response(JSON.stringify({ error: 'Missing required parameters: content, target_channels' }), {
        status: 400,
        headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' }
      });
    }

    const results: any[] = [];

    // Concurrently route to targeted channels
    await Promise.all(target_channels.map(async (channel) => {
      try {
        if (channel === 'beehiiv') {
          console.log(`[Omnichannel] Publishing to Beehiiv: ${title}`);
          // Mock Beehiiv API integration
          // In production, we would use fetch('https://api.beehiiv.com/v2/...', ...)
          results.push({ channel: 'beehiiv', status: 'success', message: 'Published to Beehiiv newsletter' });
        } else if (channel === 'social') {
          console.log(`[Omnichannel] Publishing to Social: ${title}`);
          // Mock Social API integration
          results.push({ channel: 'social', status: 'success', message: 'Published to Social platforms' });
        } else {
          console.log(`[Omnichannel] Unknown channel: ${channel}`);
          results.push({ channel, status: 'skipped', message: 'Unknown channel' });
        }
      } catch (err: any) {
        console.error(`[Omnichannel] Failed to publish to ${channel}:`, err);
        results.push({ channel, status: 'error', error: err.message });
      }
    }));

    return new Response(JSON.stringify({
      message: 'Omnichannel distribution completed.',
      results
    }), {
      headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error: any) {
    console.error("Omnichannel Publisher Fatal Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' },
    });
  }
});
