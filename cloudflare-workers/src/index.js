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
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Idempotency-Key, x-axim-app-id',
    'Access-Control-Max-Age': '86400',
  };
}

const rateLimitMap = new Map();

function checkRateLimit(ip) {
  if (!ip) return true; // Can't limit if no IP

  const now = Date.now();
  cleanupRateLimitMap(now);
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

let lastCleanup = Date.now();
function cleanupRateLimitMap(now) {
  if (now - lastCleanup > 60 * 1000) {
    for (const [key, record] of rateLimitMap.entries()) {
      if (now > record.resetAt) {
        rateLimitMap.delete(key);
      }
    }
    lastCleanup = now;
  }
}

export default {
  async fetch(request, env, ctx) {
    const corsHeaders = getCorsHeaders(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);

    // Rate Limiting
    const ip = request.headers.get('CF-Connecting-IP');
    if (!checkRateLimit(ip)) {
      return new Response("Too Many Requests", { status: 429, headers: corsHeaders });
    }

    // Health Check Endpoint
    if (url.pathname === '/health' || url.pathname === '/api/edge/healthz') {
      return new Response(JSON.stringify({ status: 'ok' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
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
      // Proxy to GCP backend
      try {
        const targetUrl = new URL(request.url);
        const backendUrl = new URL(env.GCP_BACKEND_URL || 'https://gcp.axim.us.com');
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

        // Bypass edge cache if no Cache-Control header is present from origin
        if (!proxyResponse.headers.has('Cache-Control')) {
          proxyResponse.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        }

        // Edge Caching Storage
        if (request.method === 'GET' && cacheableEndpoints.includes(url.pathname)) {
           // We clone it to put in cache
           const responseToCache = new Response(proxyResponse.body, proxyResponse);
           responseToCache.headers.set('Cache-Control', 'max-age=60');
           ctx.waitUntil(caches.default.put(request, responseToCache.clone()));
        }

        return proxyResponse;
      } catch (error) {
        return new Response("API Proxy Error", { status: 502, headers: corsHeaders });
      }
    }

    // For standard fallback index files, enforce no-store header block
    if (url.pathname === '/index.html' || url.pathname.endsWith('.html') || url.pathname === '/') {
      return new Response(JSON.stringify({ error: 'Frontend pages are served by Cloudflare Pages' }), {
        status: 404,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
        }
      });
    }

    return new Response(JSON.stringify({ error: 'Frontend pages are served by Cloudflare Pages' }), {
        status: 404,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
        }
    });
  }
};
