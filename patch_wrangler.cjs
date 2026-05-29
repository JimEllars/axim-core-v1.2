const fs = require('fs');
let content = fs.readFileSync('cloudflare-workers/wrangler.toml', 'utf8');
// remove multiple environments to prevent the warning that may be failing the build
content = content.replace(/# Define environments if needed \(e\.g\., staging, production\)[\s\S]*/, '');
fs.writeFileSync('cloudflare-workers/wrangler.toml', content, 'utf8');
