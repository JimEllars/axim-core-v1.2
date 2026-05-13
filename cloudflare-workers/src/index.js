/* eslint-disable no-unused-vars */
/* global Response, Request, URL, fetch, setInterval, caches */
/**
 * AXiM Core Cloudflare Worker
 *
 * This edge worker serves as a high-performance proxy and caching layer for AXiM Core,
 * reducing latency and origin server load.
 */

function getCorsHeaders(request, env) {
  const origin = request.headers.get('Origin');

  // Get allowed origins from environment, or use a default secure fallback
  const allowedOriginsStr = env?.ALLOWED_ORIGINS || 'https://axim.us.com';
  const allowedOrigins = allowedOriginsStr.split(',').map(url => url.trim());

  // Only reflect the origin if it's explicitly allowed
  const allowOrigin = (origin && allowedOrigins.includes(origin)) ? origin : allowedOrigins[0];

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-axim-app-id',
    'Access-Control-Max-Age': '86400',
  };
}

// Handle OPTIONS requests for CORS preflight
function handleOptions(request, env) {
  if (
    request.headers.get('Origin') !== null &&
    request.headers.get('Access-Control-Request-Method') !== null &&
    request.headers.get('Access-Control-Request-Headers') !== null
  ) {
    // Handle CORS preflight requests
    return new Response(null, {
      headers: getCorsHeaders(request, env),
    });
  } else {
    // Handle standard OPTIONS request
    return new Response(null, {
      headers: {
        Allow: 'GET, HEAD, POST, OPTIONS',
      },
    });
  }
}


const rateLimitMap = new Map();

function checkRateLimit(ip) {
  if (!ip) return true; // Can't limit if no IP

  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute
  const maxRequests = 100;

  let record = rateLimitMap.get(ip);
  if (!record) {
    record = { count: 1, resetAt: now + windowMs };
    rateLimitMap.set(ip, record);
    return true;
  }

  if (now > record.resetAt) {
    record.count = 1;
    record.resetAt = now + windowMs;
    return true;
  }

  record.count++;
  if (record.count > maxRequests) {
    return false;
  }

  return true;
}

// Memory cleanup for rate limiter map
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of rateLimitMap.entries()) {
    if (now > record.resetAt) {
      rateLimitMap.delete(ip);
    }
  }
}, 60 * 1000);

export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Idempotency-Key",
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);

    // Rate Limiting
    const ip = request.headers.get('CF-Connecting-IP');
    if (!checkRateLimit(ip)) {
      return new Response("Too Many Requests", { status: 429, headers: corsHeaders });
    }

    // 1. API Proxy Routing
    if (url.pathname.startsWith('/api/')) {
      // Edge Caching
      const cacheableEndpoints = ['/api/system/capabilities', '/api/providers/status'];
      if (request.method === 'GET' && cacheableEndpoints.includes(url.pathname)) {
        const cache = caches.default;
        const cachedResponse = await cache.match(request);
        if (cachedResponse) {
           return cachedResponse;
        }
      }
      // Add your existing GCP backend proxy logic here
      try {
        const targetUrl = new URL(request.url);
        const backendUrl = new URL(env.GCP_BACKEND_URL);
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

        // Edge Caching Storage
        if (request.method === 'GET' && cacheableEndpoints.includes(url.pathname)) {
           // We clone it to put in cache
           const responseToCache = new Response(proxyResponse.body, proxyResponse);
           responseToCache.headers.set('Cache-Control', 'max-age=60');
           ctx.waitUntil(caches.default.put(request, responseToCache.clone()));
        }

        return proxyResponse;
      } catch (error) {
        return new Response("API Proxy Error", { status: 502 });
      }
    }

    // 2. Static Asset Serving & SPA Fallback
    try {
      // Attempt to fetch the static asset requested (e.g., /assets/index.js, /login)
      let response = await env.ASSETS.fetch(request);

      // SPA Fallback: If it's a 404 and NOT a direct static asset file request,
      // serve index.html so React Router can take over.
      if (response.status === 404 && !url.pathname.startsWith('/assets/')) {
        const indexRequest = new Request(new URL('/index.html', request.url), request);
        response = await env.ASSETS.fetch(indexRequest);
      }

      // 3. Cache Control (Fixes the White Screen issue)
      response = new Response(response.body, response);
      if (url.pathname === '/' || url.pathname.endsWith('.html') || response.status === 404) {
        response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      } else if (url.pathname.startsWith('/assets/')) {
        response.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
      }

      return response;
    } catch (error) {
      return new Response("Internal Server Error fetching assets", { status: 500 });
    }
  }
};
