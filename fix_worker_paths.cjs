const fs = require('fs');

const path = '.github/workflows/reusable-run-tests.yml';
let content = fs.readFileSync(path, 'utf8');

// It says `npx wrangler deploy --dry-run -c wrangler.toml` in onyx-edge-worker which builds a bundle inside .wrangler.
// Let's modify the build verification to be slightly more resilient, to avoid conflicting with the root wrangler config if it picks up paths incorrectly.
// Actually, earlier the CI failed at "axim-core-worker" which is the root worker.
// Let's look at `package.json` at root:
/*
    "deploy": "npm run build && cd cloudflare-workers && npm run deploy",
    "dry-run": "npm run build && cd cloudflare-workers && npm run dry-run",
*/
