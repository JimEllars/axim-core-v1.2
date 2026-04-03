import { getCorsHeaders } from '../_shared/cors.ts';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';



serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req.headers.get('Origin')) });
  }

  try {
    const { url } = await req.json();

    if (!url) {
      return new Response(JSON.stringify({ error: 'URL is required' }), {
        status: 400,
        headers: { ...getCorsHeaders(req.headers.get('Origin')), 'Content-Type': 'application/json' },
      });
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
    }

    const text = await response.text();

    return new Response(JSON.stringify({ content: text }), {
      headers: { ...getCorsHeaders(req.headers.get('Origin')), 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...getCorsHeaders(req.headers.get('Origin')), 'Content-Type': 'application/json' },
    });
  }
});
