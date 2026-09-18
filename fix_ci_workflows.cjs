const fs = require('fs');

let content1 = fs.readFileSync('.github/workflows/verify-smoke-tests.yml', 'utf8');
content1 = content1.replace(/npx wrangler deploy --dry-run -c wrangler\.toml/g, "npx wrangler deploy src/index.js --dry-run -c wrangler.toml");
fs.writeFileSync('.github/workflows/verify-smoke-tests.yml', content1);

let content2 = fs.readFileSync('.github/workflows/reusable-run-tests.yml', 'utf8');
content2 = content2.replace(/npx wrangler deploy --dry-run -c wrangler\.toml/g, "npx wrangler deploy src/index.js --dry-run -c wrangler.toml");
fs.writeFileSync('.github/workflows/reusable-run-tests.yml', content2);
