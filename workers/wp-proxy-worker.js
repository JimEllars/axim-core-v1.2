// Cloudflare Worker for WordPress Proxy
// Harden against PHP2Shell and CGI injection vulnerabilities

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
  "Access-Control-Max-Age": "86400",
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const allowedWpRoutes = [
      '/wp-json/wp/v2/posts',
      '/wp-json/wp/v2/media',
      '/wp-json/wp/v2/categories',
      '/wp-content/uploads/'
    ];

    let isAllowed = false;
    for (const route of allowedWpRoutes) {
      // Allow exact matches or prefixes for these API/content paths
      if (url.pathname.startsWith(route) || url.pathname.replace('/wp', '').startsWith(route)) {
        isAllowed = true;
        break;
      }
    }

    const queryString = url.search.toLowerCase();
    const hasSuspiciousCgi = ['?-d', 'auto_prepend_file', 'auto_append_file', 'allow_url_include', 'disable_functions'].some(pattern => queryString.includes(pattern));

    if (!isAllowed || url.pathname.includes('/wp-login.php') || url.pathname.includes('/wp-admin') || url.pathname.includes('.php') || hasSuspiciousCgi) {
      // Log security alert to telemetry in background
      try {
        const telemetryUrl = new URL(request.url);
        telemetryUrl.pathname = '/telemetry';
        const alertPayload = {
          app_id: 'wp-proxy-worker',
          event_type: 'security_alert',
          severity: 'ERROR',
          metadata: {
            reason: 'Blocked suspicious PHP/WP route or CGI pattern',
            path: url.pathname,
            query: url.search,
            ip: request.headers.get('CF-Connecting-IP') || 'unknown'
          }
        };
        ctx.waitUntil(fetch(telemetryUrl.toString(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(alertPayload)
        }).catch(() => {}));
      } catch(e) {}

      return new Response('Forbidden', { status: 403, headers: corsHeaders });
    }

    // Proxy to WordPress backend (Assuming WP_URL is in env)
    const wpUrlStr = env.WP_URL || 'https://wp.axim.us.com';
    const targetUrl = new URL(wpUrlStr);
    targetUrl.pathname = url.pathname;
    targetUrl.search = url.search;

    const modifiedRequest = new Request(targetUrl, request);
    try {
      const response = await fetch(modifiedRequest);
      const proxyResponse = new Response(response.body, response);
      Object.keys(corsHeaders).forEach(key => {
        proxyResponse.headers.set(key, corsHeaders[key]);
      });
      return proxyResponse;
    } catch (e) {
      return new Response('Proxy Error', { status: 502, headers: corsHeaders });
    }
  }
};
