const fs = require('fs');

let content = fs.readFileSync('cloudflare-workers/tests/integration.test.js', 'utf8');

const newTests = `
  it('should enforce no-store cache header for fallback routes like /index.html', async () => {
    const response = await fetch(\`\${WORKER_URL}/index.html\`);
    expect(response.status).toBe(404);
    expect(response.headers.get('Cache-Control')).toBe('no-store, no-cache, must-revalidate, proxy-revalidate');
  });

  it('should return rate limit 429 warnings under intense traffic for /api/* routes', async () => {
    // This assumes checking a bunch of times hits the limit
    const promises = [];
    for (let i = 0; i < 110; i++) {
        promises.push(fetch(\`\${WORKER_URL}/api/test-rate-limit\`, {
             headers: { 'CF-Connecting-IP': '127.0.0.99' }
        }));
    }
    const responses = await Promise.all(promises);

    // Check if at least one response was rate-limited (429)
    const hasRateLimit = responses.some(res => res.status === 429);
    expect(hasRateLimit).toBe(true);
  });
});
`;

content = content.replace(/}\);\n$/, newTests);

fs.writeFileSync('cloudflare-workers/tests/integration.test.js', content, 'utf8');
