/* eslint-disable no-unused-vars */
/**
 * AXiM Core Cloudflare Worker
 *
 * This edge worker serves as a high-performance proxy and caching layer for AXiM Core,
 * reducing latency and origin server load.
 */

function getCorsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  const allowedOrigins = new Set(
    (env.ALLOWED_ORIGINS || '')
      .split(',')
      .map((allowedOrigin) => allowedOrigin.trim())
      .filter(Boolean)
  );
  const isAllowedOrigin = origin && allowedOrigins.has(origin);

  return {
    ...(isAllowedOrigin ? { 'Access-Control-Allow-Origin': origin } : {}),
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Idempotency-Key, x-axim-app-id, X-Emailit-Signature',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

export default {
  async fetch(request, env, ctx) {
    const corsHeaders = getCorsHeaders(request, env);

    if (request.method === 'OPTIONS') {
      if (request.headers.get('Origin') && !corsHeaders['Access-Control-Allow-Origin']) {
        const rejectionCountKey = `403_rejections_${Math.floor(Date.now() / 60000)}`;
        let count = 1;
        if (env.KV) {
          count = parseInt(await env.KV.get(rejectionCountKey) || '0', 10) + 1;
          ctx.waitUntil(env.KV.put(rejectionCountKey, count.toString(), { expirationTtl: 120 }));
        }

        if (count > 50 && env.ALERT_WEBHOOK_URL) {
           ctx.waitUntil(fetch(env.ALERT_WEBHOOK_URL, {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({ text: `High number of 403 rejections detected at edge (${count} in the last minute).` })
           }).catch(err => console.error("Alert webhook failed:", err)));
        }

        return new Response('Origin not allowed', { status: 403, headers: corsHeaders });
      }

      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);

    // Rate Limiting using Cloudflare Rate Limiting binding
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';

    // Bypass rate limiter for telemetry to prevent user-facing 429s from background polling
    const isTelemetryEndpoint = url.pathname.endsWith('/telemetry-ingress') ||
                               url.pathname.endsWith('/satellite-telemetry') ||
                               url.pathname.endsWith('/email-tracking-webhook') ||
                               url.pathname.endsWith('/system-status') ||
                               url.pathname.includes('/system-status');

    if (env.RATE_LIMITER && !isTelemetryEndpoint) {
      const { success } = await env.RATE_LIMITER.limit({ key: ip });
      if (!success) {
        return new Response(JSON.stringify({ error: "Too Many Requests", message: "Rate limit exceeded." }), {
          status: 429,
          headers: Object.assign({}, corsHeaders, {
            "Content-Type": "application/json",
            "X-AXiM-Edge-Throttled": "true"
          })
        });
      }
    }

    // Health Check Endpoint

    // Instant Telemetry Acknowledgment and Webhooks
    if (url.pathname.endsWith('/telemetry-ingress') || url.pathname.endsWith('/satellite-telemetry') || url.pathname.endsWith('/email-tracking-webhook')) {
      try {
        const targetUrl = new URL(request.url);
        const backendUrlStr = env.SUPABASE_URL;
        if (!backendUrlStr) {
          return new Response('API backend is not configured', { status: 503, headers: corsHeaders });
        }

        const backendUrl = new URL(backendUrlStr);
        targetUrl.hostname = backendUrl.hostname;
        targetUrl.port = backendUrl.port || '';
        targetUrl.protocol = backendUrl.protocol;

        const modifiedRequest = new Request(targetUrl, request.clone());
        modifiedRequest.headers.set('x-forwarded-host', request.headers.get('host') || '');

        // Push the processing to the background
        ctx.waitUntil(fetch(modifiedRequest).catch(err => console.error("Telemetry/Webhook forward failed:", err)));

        // Instantly return 202 Accepted to prevent UI blocking
        return new Response(JSON.stringify({ success: true, edge_queued: true }), {
          status: 202,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (e) {
        // Fallback gracefully
        console.error("Failed to queue telemetry/webhook at edge", e);
      }
    }

    if (url.pathname === '/api/edge/healthz' && request.method === 'GET') {
      // memory stats (not fully available in V8 isolates without specific bindings, mock or return limited info)
      const memoryStats = { usage: 'unknown', available: 'unknown' };

      return new Response(
        JSON.stringify({
          status: 'active',
          edge_location: request.cf?.colo || 'unknown',
          memory_stats: memoryStats,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 1. API Proxy Routing
    if (url.pathname.startsWith('/api/')) {
      // Edge Caching
      const cacheableEndpoints = ['/api/system/capabilities', '/api/providers/status']; // Removed /api/system-status to avoid serving stale telemetry data
      if (request.method === 'GET' && cacheableEndpoints.includes(url.pathname)) {
        const cache = caches.default;
        const cachedResponse = await cache.match(request);
        if (cachedResponse) {
           return cachedResponse;
        }
      }
      // Proxy to Supabase backend
      try {
        const targetUrl = new URL(request.url);
        const backendUrlStr = env.SUPABASE_URL;
        if (!backendUrlStr) {
          return new Response('API backend is not configured', { status: 503, headers: corsHeaders });
        }
        const backendUrl = new URL(backendUrlStr);
        targetUrl.hostname = backendUrl.hostname;
        targetUrl.port = backendUrl.port || '';
        targetUrl.protocol = backendUrl.protocol;

        const modifiedRequest = new Request(targetUrl, request);
        modifiedRequest.headers.set('x-forwarded-host', request.headers.get('host') || '');
        const response = await fetch(modifiedRequest);

        const proxyResponse = new Response(response.body, response);
        Object.keys(corsHeaders).forEach(key => {
          proxyResponse.headers.set(key, corsHeaders[key]);
        });
        proxyResponse.headers.set('X-AXiM-Edge-Location', request.cf?.colo || 'unknown');

        // Bypass edge cache if no Cache-Control header is present from origin
        if (!proxyResponse.headers.has('Cache-Control')) {
          proxyResponse.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        }

        // Edge Caching Storage
        if (request.method === 'GET' && cacheableEndpoints.includes(url.pathname)) {
           // We clone it to put in cache
           const responseToCache = proxyResponse.clone();
           if (url.pathname === '/api/system-status') {
             responseToCache.headers.set('Cache-Control', 'max-age=15');
           } else {
             responseToCache.headers.set('Cache-Control', 'max-age=60');
           }
           ctx.waitUntil(caches.default.put(request, responseToCache));
        }

        return proxyResponse;
      } catch (error) {
        return new Response("API Proxy Error", { status: 502, headers: corsHeaders });
      }
    }


    // 2. Static Asset Caching
    const isStaticAsset = url.pathname.match(/\.(js|css|png|woff2|jpg|jpeg|gif|svg|ico)$/i) ||
                          url.pathname.startsWith('/assets/') ||
                          url.pathname.startsWith('/static/');

    const isBypassedRoute = url.pathname.includes('/api/') ||
                            url.pathname.includes('/telemetry-ingress') ||
                            url.pathname.includes('/system-status') ||
                            url.pathname.includes('/auth/');

    if (isStaticAsset && !isBypassedRoute && request.method === 'GET') {
      try {
        // Since Cloudflare Pages handles the actual serving, we don't have ASSETS binding by default in a standard worker.
        // If this worker sits in front of a site, we usually fetch the origin.
        // Wait, normally if this is just a proxy worker on a route, if we return fetch(request) we pass it to the origin.
        const response = await fetch(request);
        const staticResponse = new Response(response.body, response);
        staticResponse.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
        Object.keys(corsHeaders).forEach(key => {
          staticResponse.headers.set(key, corsHeaders[key]);
        });
        return staticResponse;
      } catch (err) {
        // Fallback
      }
    }

    // Default Response for Non-API requests (Not Found)
    return new Response('404 Not Found', {
      status: 404,
      headers: {
        ...corsHeaders,
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
      }
    });
  }
};
