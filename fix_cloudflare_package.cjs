const fs = require('fs');

let content = fs.readFileSync('cloudflare-workers/package.json', 'utf8');

content = content.replace(/"deploy": "npx wrangler deploy -c wrangler\.toml",/g, '"deploy": "npx wrangler deploy src/index.js -c wrangler.toml",');
content = content.replace(/"dry-run": "npx wrangler deploy --dry-run -c wrangler\.toml",/g, '"dry-run": "npx wrangler deploy src/index.js --dry-run -c wrangler.toml",');
content = content.replace(/"build": "npx wrangler deploy --dry-run -c wrangler\.toml",/g, '"build": "npx wrangler deploy src/index.js --dry-run -c wrangler.toml",');
content = content.replace(/"deploy:dry-run": "npx wrangler deploy --dry-run -c wrangler\.toml"/g, '"deploy:dry-run": "npx wrangler deploy src/index.js --dry-run -c wrangler.toml"');

fs.writeFileSync('cloudflare-workers/package.json', content);
