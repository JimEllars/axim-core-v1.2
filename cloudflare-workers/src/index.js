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
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Idempotency-Key, x-axim-app-id',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

// Global rate limit constants
const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = 100;

// Replaced local map with KV logic
async function checkRateLimit(ip, env) {
  if (!ip || !env.RATE_LIMIT_KV) return { allowed: true, count: 1 };

  const kvKey = `rate_limit:${ip}`;

  let recordStr = await env.RATE_LIMIT_KV.get(kvKey);
  let record = recordStr ? JSON.parse(recordStr) : null;

  const now = Date.now();

  if (!record || now > record.resetAt) {
    record = { count: 1, resetAt: now + WINDOW_MS };
  } else {
    record.count++;
  }

  // We write it back to KV. Using expirationTtl allows Cloudflare to handle cleanup naturally
  await env.RATE_LIMIT_KV.put(kvKey, JSON.stringify(record), {
    expirationTtl: Math.ceil(WINDOW_MS / 1000)
  });

  if (record.count > MAX_REQUESTS) {
    return { allowed: false, count: record.count };
  }

  return { allowed: true, count: record.count };
}

export default {
  async fetch(request, env, ctx) {
    const corsHeaders = getCorsHeaders(request, env);

    if (request.method === 'OPTIONS') {
      if (request.headers.get('Origin') && !corsHeaders['Access-Control-Allow-Origin']) {
        return new Response('Origin not allowed', { status: 403, headers: corsHeaders });
      }

      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);

    // Rate Limiting
    const ip = request.headers.get('CF-Connecting-IP');
    const limitResult = await checkRateLimit(ip, env);
    if (!limitResult.allowed) {
      return new Response("Too Many Requests", { status: 429, headers: Object.assign({}, corsHeaders, { "X-AXiM-Edge-Throttled": limitResult.count.toString() }) });
    }

    // Health Check Endpoint
    if (url.pathname === '/api/edge/healthz' && request.method === 'GET') {
      // For healthz we just reuse the limitResult from earlier
      const limitRemaining = Math.max(0, MAX_REQUESTS - limitResult.count);
      // memory stats (not fully available in V8 isolates without specific bindings, mock or return limited info)
      const memoryStats = { usage: 'unknown', available: 'unknown' };

      return new Response(
        JSON.stringify({
          status: 'active',
          edge_location: request.cf?.colo || 'unknown',
          memory_stats: memoryStats,
          rate_limit_capacity: limitRemaining
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 1. API Proxy Routing
    if (url.pathname.startsWith('/api/')) {
      // Edge Caching
      const cacheableEndpoints = ['/api/system/capabilities', '/api/providers/status', '/api/system-status'];
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
        const limitRemaining = Math.max(0, MAX_REQUESTS - limitResult.count);
        proxyResponse.headers.set('X-AXiM-RateLimit-Remaining', limitRemaining.toString());

        // Bypass edge cache if no Cache-Control header is present from origin
        if (!proxyResponse.headers.has('Cache-Control')) {
          proxyResponse.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        }

        // Edge Caching Storage
        if (request.method === 'GET' && cacheableEndpoints.includes(url.pathname)) {
           // We clone it to put in cache
           const responseToCache = new Response(proxyResponse.body, proxyResponse);
           if (url.pathname === '/api/system-status') {
             responseToCache.headers.set('Cache-Control', 'max-age=15');
           } else {
             responseToCache.headers.set('Cache-Control', 'max-age=60');
           }
           ctx.waitUntil(caches.default.put(request, responseToCache.clone()));
        }

        return proxyResponse;
      } catch (error) {
        return new Response("API Proxy Error", { status: 502, headers: corsHeaders });
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
