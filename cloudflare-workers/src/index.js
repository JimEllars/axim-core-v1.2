/* eslint-env serviceworker */
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

/**
 * Handle incoming requests
 */
// eslint-disable-next-line no-unused-vars
async function handleRequest(request, env, ctx) {
  const url = new URL(request.url);

  // --- 1. Health Check Endpoint ---
  if (url.pathname === '/api/edge/healthz' && request.method === 'GET') {
    return new Response(
      JSON.stringify({ status: 'active', edge_location: request.cf?.colo || 'unknown' }),
      {
        headers: { ...getCorsHeaders(request, env), 'Content-Type': 'application/json' },
      }
    );
  }

  // --- 2. Proxy to GCP Backend (Foundation) ---
  if (!url.pathname.startsWith('/api/edge/')) {
    try {
      if (!env.GCP_BACKEND_URL) {
        return new Response(JSON.stringify({ error: 'Edge Proxy Error: Backend URL not configured' }), {
          status: 503,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Modify URL to point to backend
      const targetUrl = new URL(request.url);
      const backendUrl = new URL(env.GCP_BACKEND_URL);
      targetUrl.hostname = backendUrl.hostname;
      if (backendUrl.port) {
        targetUrl.port = backendUrl.port;
      }
      targetUrl.protocol = backendUrl.protocol;

      // Prepare request to origin
      const modifiedRequest = new Request(targetUrl, request);

      // Optionally modify headers before sending to origin
      modifiedRequest.headers.set('x-forwarded-host', request.headers.get('host') || '');

      const response = await fetch(modifiedRequest);

      // Create new response to add CORS headers
      const proxyResponse = new Response(response.body, response);

      // Append CORS headers
      Object.entries(getCorsHeaders(request, env)).forEach(([key, value]) => {
        proxyResponse.headers.set(key, value);
      });

      return proxyResponse;
    // eslint-disable-next-line no-unused-vars
    } catch (error) {
      return new Response(JSON.stringify({ error: 'Edge Proxy Error: Unable to reach origin' }), {
        status: 502,
        headers: { ...getCorsHeaders(request, env), 'Content-Type': 'application/json' }
      });
    }
  }

  // Default Response (Not Found)
  return new Response('AXiM Core Edge Worker - Route Not Found', {
    status: 404,
    headers: getCorsHeaders(request, env)
  });
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return handleOptions(request, env);
    }
    return handleRequest(request, env, ctx);
  },
};
