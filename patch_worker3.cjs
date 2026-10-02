const fs = require('fs');
const path = require('path');

const targetPath = path.join(__dirname, 'cloudflare-workers', 'src', 'index.js');
let content = fs.readFileSync(targetPath, 'utf-8');

// Update instant telemetry acknowledgment block to match /telemetry exactly
content = content.replace(
  "if (url.pathname.endsWith('/telemetry-ingress')",
  "if (url.pathname === '/telemetry' || url.pathname.endsWith('/telemetry-ingress')"
);

fs.writeFileSync(targetPath, content);
console.log('Worker patched again');
