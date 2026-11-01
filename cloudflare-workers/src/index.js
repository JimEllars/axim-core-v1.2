/**
 * AXiM Core edge worker: ingress, CORS, replay hardening and API proxying.
 *
 * Request handling order matters here and is deliberate:
 *   1. origin allow-list          -> 403
 *   2. shell/CGI + traversal scan -> 403
 *   3. replay timestamp check     -> 401/400
 *   4. OPTIONS preflight
 *   5. health probes
 *   6. telemetry fast-ack (202, forwarded via ctx.waitUntil)
 *   7. API proxy
 *   8. static asset passthrough
 *   9. 404
 */

const BASE_CORS_HEADERS = {
  "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
  "Access-Control-Max-Age": "86400",
};

/**
 * Build CORS headers for a single request.
 *
 * The previous implementation mutated a module-level `corsHeaders` object. In a
 * Workers isolate that object is shared by every request the isolate handles, so
 * one request's reflected origin leaked into the next request that arrived
 * without an Origin header. Headers must be per-request.
 */
export function buildCorsHeaders(origin, allowedOrigins) {
  const list = Array.isArray(allowedOrigins) && allowedOrigins.length > 0 ? allowedOrigins : ['*'];
  const allowsWildcard = list.includes('*');
  const headers = { ...BASE_CORS_HEADERS };

  if (allowsWildcard) {
    headers['Access-Control-Allow-Origin'] = '*';
  } else if (origin && list.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  } else {
    // Unlisted origin: echo the primary allowed origin rather than reflecting
    // the caller. The request itself is rejected earlier, this only keeps
    // responses CORS-parsable.
    headers['Access-Control-Allow-Origin'] = list[0];
  }

  return headers;
}

const apiRoutes = new Map([
  ['/api-proxy', '/functions/v1/api-proxy'],
  ['/telemetry', '/functions/v1/telemetry-ingress'],
  ['/capabilities', '/functions/v1/api-capabilities'],
  ['/api/providers/status', '/functions/v1/system-status'],
  ['/api/system-status', '/functions/v1/system-status'],
  ['/api/v1/robotics/telemetry', '/functions/v1/telemetry-ingress'],
  ['/api/v1/robotics/capabilities', '/functions/v1/api-capabilities'],
  ['/api/v1/robotics/projects', '/functions/v1/robotics-projects'],
  ['/api/v1/robotics/sim', '/functions/v1/robotics-sim'],
  ['/api/v1/robotics/fleet/emergency-stop', '/functions/v1/robotics-emergency-stop'],
  ['/mcp', '/functions/v1/mcp-router'],
  ['/sse', '/functions/v1/mcp-sse'],
  ['/message', '/functions/v1/mcp-message'],
  ['/api/v1/mcp', '/functions/v1/mcp-router'],
  ['/api/v1/mcp/sse', '/functions/v1/mcp-sse'],
  ['/api/v1/mcp/message', '/functions/v1/mcp-message']
]);

/** PHP/CGI argument-injection and shell-probe markers (CVE-2024-4577 class). */
const BLOCKED_INGRESS_PATTERNS = [
  /[?&]-d(?:=|&|$)/,            // ?-d allow_url_include=1
  /auto_prepend_file/i,
  /auto_append_file/i,
  /allow_url_include/i,
  /disable_functions/i,
  /\bsafe_mode\b/i,
  /proc\/self\/environ/i,
  /\/etc\/passwd/i,
];

/** Path traversal and direct PHP entry-point probing. */
const BLOCKED_TRAVERSAL_PATTERNS = [
  /\.\.(?:\/|\\|\?|$)/,
  /%2e%2e/i,
  /%252e/i,
  /\/wp-admin(?:$|\/|\?)/i,
  /\.php(?:$|\/|\?|#)/i,
  /\.phtml(?:$|\/|\?|#)/i,
];

export function decodeTargetSafely(target) {
  try {
    return decodeURIComponent(target);
  } catch {
    // Malformed percent-encoding is itself suspicious; return the raw target so
    // the traversal patterns still get a chance to match.
    return target;
  }
}

/**
 * True when the request target looks like a CGI/PHP shell or traversal attempt.
 * Matches against the raw target and its decoded form so double-encoding does
 * not slip through.
 */
export function isBlockedIngress(pathname, search = '') {
  const candidates = [pathname + search, decodeTargetSafely(pathname + search)];
  return candidates.some(
    (target) =>
      BLOCKED_INGRESS_PATTERNS.some((pattern) => pattern.test(target)) ||
      BLOCKED_TRAVERSAL_PATTERNS.some((pattern) => pattern.test(target)),
  );
}

export const REPLAY_WINDOW_SECONDS = 300;

/**
 * Validate an optional `x-axim-timestamp` replay header.
 *
 * Absence is tolerated (satellite signers do not all emit it yet); a present but
 * stale or unparseable value is rejected, which is the case that matters for
 * replay defence. Full requirement of the header belongs with the signature
 * verification inside each function.
 */
export function evaluateReplayHeader(timestampHeader, nowSeconds) {
  if (timestampHeader === null || timestampHeader === undefined || timestampHeader === '') {
    return { ok: true, reason: 'absent' };
  }
  const parsed = Number.parseInt(String(timestampHeader).trim(), 10);
  if (!Number.isFinite(parsed)) {
    return { ok: false, reason: 'unparseable' };
  }
  if (Math.abs(nowSeconds - parsed) > REPLAY_WINDOW_SECONDS) {
    return { ok: false, reason: 'stale' };
  }
  return { ok: true, reason: 'fresh' };
}

function setHeaderIfPresent(headers, key, value) {
  if (value) {
    headers.set(key, value);
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Hardcoded origin check
    const allowedOrigins = env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(',') : ['*'];
    const origin = request.headers.get('Origin');

    if (origin && allowedOrigins[0] !== '*' && !allowedOrigins.includes(origin)) {
       return new Response('Forbidden', { status: 403 });
    }

    // Per-request CORS headers - never shared module state.
    const corsHeaders = buildCorsHeaders(origin, allowedOrigins);

    // Edge perimeter: reject CGI argument injection / traversal before any
    // proxying happens.
    if (isBlockedIngress(url.pathname, url.search)) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }

    // Replay hardening: a present-but-stale X-Axim-Timestamp is refused at the
    // edge instead of being forwarded to the origin.
    const replay = evaluateReplayHeader(
      request.headers.get('x-axim-timestamp') || request.headers.get('X-Axim-Timestamp'),
      Math.floor(Date.now() / 1000),
    );
    if (!replay.ok) {
      return new Response(JSON.stringify({ error: 'Stale or invalid X-Axim-Timestamp', reason: replay.reason }), {
        status: replay.reason === 'unparseable' ? 400 : 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }

    if (request.method === "OPTIONS") {
      let headers = request.headers;
      if (
        headers.get("Origin") !== null &&
        headers.get("Access-Control-Request-Method") !== null &&
        headers.get("Access-Control-Request-Headers") !== null
      ) {
        let respHeaders = {
          ...corsHeaders,
          "Access-Control-Allow-Headers": headers.get("Access-Control-Request-Headers") || "",
        };

        return new Response(null, {
          headers: respHeaders,
        });
      } else {
        return new Response(null, {
          headers: {
            Allow: "GET, HEAD, POST, OPTIONS",
          },
        });
      }
    }

    const healthBody = () => JSON.stringify({
      status: 'UP',
      service: 'axim-core-edge',
      edge_location: request.cf?.colo || 'unknown',
      timestamp: new Date().toISOString()
    });

    // Health probes. /health keeps its historical 202 for existing monitors;
    // /api/v1/health answers 200 with the same body so standard HTTP health
    // checks (which treat 202 as ambiguous) work too.
    if ((url.pathname === '/health' || url.pathname === '/api/v1/health') && request.method === 'GET') {
      return new Response(healthBody(), {
        status: url.pathname === '/health' ? 202 : 200,
        headers: { "Content-Type": "application/json", ...corsHeaders }
      });
    }

    // Instant Telemetry Acknowledgment and Webhooks
    if (url.pathname === '/telemetry' || url.pathname.endsWith('/telemetry-ingress') || url.pathname.endsWith('/satellite-telemetry') || url.pathname.endsWith('/email-tracking-webhook')) {
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

        // Ensure edge payloads attach normalized geo-headers
        setHeaderIfPresent(modifiedRequest.headers, 'x-cf-ipcountry', request.cf?.country || 'XX');
        setHeaderIfPresent(modifiedRequest.headers, 'x-cf-region', request.cf?.region);
        setHeaderIfPresent(modifiedRequest.headers, 'x-cf-city', request.cf?.city);
        setHeaderIfPresent(modifiedRequest.headers, 'x-cf-asn', request.cf?.asn);
        setHeaderIfPresent(modifiedRequest.headers, 'x-cf-colo', request.cf?.colo || 'UNKNOWN');
        // Handle cf-ray separately as it's from headers
        const cfRay = request.headers.get('cf-ray');
        if (cfRay) {
          modifiedRequest.headers.set('x-cf-ray', cfRay);
        }

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
    if (url.pathname.startsWith('/api/') || url.pathname === '/telemetry' || url.pathname === '/api-proxy' || url.pathname === '/capabilities' || url.pathname === '/mcp' || url.pathname === '/sse' || url.pathname === '/message') {
      const backendUrlStr = env.SUPABASE_URL;
      if (!backendUrlStr) {
        return new Response('API backend is not configured', { status: 503, headers: corsHeaders });
      }

      // Edge Caching
      const cacheableEndpoints = ['/api/system/capabilities', '/api/providers/status', '/capabilities', '/api/v1/capabilities', '/api/v1/robotics/capabilities']; // Removed /api/system-status to avoid serving stale telemetry data
      if (request.method === 'GET' && cacheableEndpoints.includes(url.pathname)) {
        const cache = caches.default;
        const cachedResponse = await cache.match(request);
        if (cachedResponse) {
           return cachedResponse;
        }
      }
      // Proxy to Supabase backend
      try {
        const targetPath = apiRoutes.get(url.pathname);
        if (!targetPath) {
          return new Response('API route not found', { status: 404, headers: corsHeaders });
        }

        const targetUrl = new URL(request.url);
        const backendUrl = new URL(backendUrlStr);
        targetUrl.hostname = backendUrl.hostname;
        targetUrl.port = backendUrl.port || '';
        targetUrl.protocol = backendUrl.protocol;
        targetUrl.pathname = targetPath;

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
