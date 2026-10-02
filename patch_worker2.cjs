const fs = require('fs');
const path = require('path');

const targetPath = path.join(__dirname, 'cloudflare-workers', 'src', 'index.js');
let content = fs.readFileSync(targetPath, 'utf-8');

// Add /telemetry and /api-proxy routing
content = content.replace(
  "const apiRoutes = new Map([",
  "const apiRoutes = new Map([\n  ['/api-proxy', '/functions/v1/api-proxy'],\n  ['/telemetry', '/functions/v1/telemetry-ingress'],"
);

// We need to support the endpoints directly if they don't have /api prefix but they are requested directly
// The frontend calls `${cfUrl}/telemetry` and `${cfUrl}/api-proxy`
content = content.replace(
  "if (url.pathname.startsWith('/api/')) {",
  "if (url.pathname.startsWith('/api/') || url.pathname === '/telemetry' || url.pathname === '/api-proxy') {"
);

fs.writeFileSync(targetPath, content);
console.log('Worker patched');
