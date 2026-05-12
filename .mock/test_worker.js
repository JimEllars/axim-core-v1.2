/* eslint-disable no-unused-vars */
/* global Response, Request, URL, fetch */
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

module.exports = {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return handleOptions(request, env);
    }

    const url = new URL(request.url);

    // 1. API Proxy Routing
    if (url.pathname.startsWith('/api/')) {
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
        Object.entries(getCorsHeaders(request, env)).forEach(([key, value]) => {
          proxyResponse.headers.set(key, value);
        });

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
