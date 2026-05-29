const fs = require('fs');

let content = fs.readFileSync('cloudflare-workers/src/index.js', 'utf8');

// Insert bypass edge cache logic
content = content.replace(
  'Object.keys(corsHeaders).forEach(key => {',
  `Object.keys(corsHeaders).forEach(key => {`
);

content = content.replace(
  '        // Edge Caching Storage',
  `        // Bypass edge cache if no Cache-Control header is present from origin
        if (!proxyResponse.headers.has('Cache-Control')) {
          proxyResponse.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        }

        // Edge Caching Storage`
);

content = content.replace(
  `    return new Response(JSON.stringify({ error: 'Frontend pages are served by Cloudflare Pages' }), {`,
  `    // For standard fallback index files, enforce no-store header block
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

    return new Response(JSON.stringify({ error: 'Frontend pages are served by Cloudflare Pages' }), {`
);

fs.writeFileSync('cloudflare-workers/src/index.js', content, 'utf8');
